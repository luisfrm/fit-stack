import { eq, ilike, and, or, count, desc, ne, sql, gte, isNull, isNotNull, type Db } from '@workspace/database/factory';
import { gymMember, authMember, user, subscription, payment } from '@workspace/database/schema';
import type { OrgRole } from '@workspace/shared';
import type { OrganizationDateManager } from '../lib/date-manager';
import { createSubscriptionsRepository } from './subscriptions.repository';

export type DbMember = typeof gymMember.$inferSelect;
export type NewDbMember = typeof gymMember.$inferInsert;

export type MemberWithRelations = DbMember & {
  user?: {
    id: string;
    email: string;
  } | null;
  role: OrgRole;
  authRole?: OrgRole | null;
  latestSubscription?: any;
};

export interface MembersFilter {
  organizationId: string;
  query?: string;
  role?: OrgRole;
  excludeRole?: OrgRole;
  isActive?: boolean;
  /** Solo miembros CON (true) o SIN (false) suscripción gym-activa. */
  hasActiveSubscription?: boolean;
  page?: number;
  limit?: number;
  requireTotal?: boolean;
  includeLatestSubscription?: boolean;
}

export interface PaginatedMembersResult {
  data: MemberWithRelations[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export function createMembersRepository(db: Db) {
  const subsRepo = createSubscriptionsRepository(db);

  return {
    async findAll(filters: MembersFilter): Promise<PaginatedMembersResult> {
      const { organizationId, query, role, excludeRole, isActive, hasActiveSubscription, page = 1, limit = 10 } = filters;
      const offset = (page - 1) * limit;

      const conditions = [eq(gymMember.organizationId, organizationId)];

      if (query) {
        conditions.push(
          or(
            ilike(gymMember.firstName, `%${query}%`),
            ilike(gymMember.lastName, `%${query}%`),
            ilike(gymMember.email, `%${query}%`),
            ilike(gymMember.documentId, `%${query}%`)
          )!
        );
      }

      if (isActive !== undefined) {
        conditions.push(eq(gymMember.isActive, isActive));
      }

      if (role) {
        conditions.push(eq(gymMember.role, role));
      }

      if (excludeRole) {
        conditions.push(ne(gymMember.role, excludeRole));
      }

      // Filtro por suscripción gym-activa (misma semántica que
      // `getSubscriptionIsActiveSql`: `processing` cuenta como activa).
      if (hasActiveSubscription !== undefined) {
        const activeSubExists = sql`EXISTS (
          SELECT 1 FROM ${subscription}
          INNER JOIN ${payment} ON ${payment.subscriptionId} = ${subscription.id}
          WHERE ${subscription.memberId} = ${gymMember.id}
            AND ${subscription.organizationId} = ${organizationId}
            AND ${subsRepo.getSubscriptionIsActiveSql(new Date())}
        )`;
        conditions.push(
          hasActiveSubscription ? activeSubExists : sql`NOT (${activeSubExists})`
        );
      }

      const whereClause = and(...conditions);

      const rows = await db
        .select({
          member: gymMember,
          authRole: authMember.role,
          user: {
            id: user.id,
            email: user.email,
          },
        })
        .from(gymMember)
        .leftJoin(
          authMember,
          and(
            eq(authMember.userId, gymMember.userId),
            eq(authMember.organizationId, organizationId)
          )
        )
        .leftJoin(user, eq(user.id, gymMember.userId))
        .where(whereClause)
        .orderBy(desc(gymMember.createdAt))
        .limit(limit)
        .offset(offset);

      const countResult = await db
        .select({ total: count() })
        .from(gymMember)
        .leftJoin(
          authMember,
          and(
            eq(authMember.userId, gymMember.userId),
            eq(authMember.organizationId, organizationId)
          )
        )
        .where(whereClause);

      const total = Number(countResult[0]?.total ?? 0);

      if (!filters.includeLatestSubscription) {
        return {
          data: rows.map((r) => ({
            ...r.member,
            role: r.member.role as OrgRole,
            authRole: r.authRole as OrgRole | null,
            user: r.user,
            latestSubscription: null,
          })),
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        };
      }

      const enrichedData = await Promise.all(
        rows.map(async (r) => {
          const latestSub = await subsRepo.findLatestForMember(
            organizationId,
            r.member.id
          );

          return {
            ...r.member,
            role: r.member.role as OrgRole,
            authRole: r.authRole as OrgRole | null,
            user: r.user,
            latestSubscription: latestSub
              ? {
                  ...latestSub,
                  startDate: latestSub.startDate.toISOString(),
                  endDate: latestSub.endDate.toISOString(),
                  planName: latestSub.planName || undefined,
                  paymentStatus: latestSub.paymentStatus,
                }
              : null,
          };
        })
      );

      return {
        data: enrichedData,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    },

    async findById(organizationId: string, id: number): Promise<MemberWithRelations | undefined> {
      const result = await db
        .select({
          member: gymMember,
          authRole: authMember.role,
          user: {
            id: user.id,
            email: user.email,
          },
        })
        .from(gymMember)
        .leftJoin(
          authMember,
          and(
            eq(authMember.userId, gymMember.userId),
            eq(authMember.organizationId, organizationId)
          )
        )
        .leftJoin(user, eq(user.id, gymMember.userId))
        .where(and(eq(gymMember.id, id), eq(gymMember.organizationId, organizationId)))
        .limit(1);

      if (result.length === 0 || !result[0]) return undefined;
      return { ...result[0].member, role: result[0].member.role as OrgRole, authRole: result[0].authRole as OrgRole | null, user: result[0].user };
    },

    async findByEmail(organizationId: string, email: string) {
      const [result] = await db
        .select()
        .from(gymMember)
        .where(and(eq(gymMember.email, email), eq(gymMember.organizationId, organizationId)))
        .limit(1);
      return result;
    },

    async findByUserId(organizationId: string, userId: string) {
      const [result] = await db
        .select()
        .from(gymMember)
        .where(and(eq(gymMember.userId, userId), eq(gymMember.organizationId, organizationId)))
        .limit(1);
      return result;
    },

    async create(data: NewDbMember) {
      const [newMember] = await db.insert(gymMember).values(data).returning();
      return newMember;
    },

    async update(organizationId: string, id: number, data: Partial<NewDbMember>) {
      const [updatedMember] = await db
        .update(gymMember)
        .set(data)
        .where(and(eq(gymMember.id, id), eq(gymMember.organizationId, organizationId)))
        .returning();
      return updatedMember;
    },

    async delete(organizationId: string, id: number) {
      await db.delete(gymMember).where(and(eq(gymMember.id, id), eq(gymMember.organizationId, organizationId)));
    },

    async deleteAuthMember(userId: string, organizationId: string) {
      await db.delete(authMember).where(
        and(
          eq(authMember.userId, userId),
          eq(authMember.organizationId, organizationId)
        )
      );
    },

    async countActive(organizationId: string, now: Date) {
      const result = await db
        .select({ value: count(sql`DISTINCT ${gymMember.id}`) })
        .from(gymMember)
        .innerJoin(subscription, eq(gymMember.id, subscription.memberId))
        .innerJoin(payment, eq(subscription.id, payment.subscriptionId))
        .where(
          and(
            eq(gymMember.organizationId, organizationId),
            eq(gymMember.isActive, true),
            sql`${subscription.cancelledAt} IS NULL`,
            gte(subscription.endDate, now),
            eq(payment.status, 'validated')
          )
        );
      return Number(result[0]?.value ?? 0);
    },

    /**
     * KPIs de clientes (`GET /api/members/stats`).
     *
     * Población: `gym_member` con `role = 'member'` de la org.
     * - `newThisMonth`: corte de mes en hora LOCAL de la org (`AT TIME ZONE`
     *   vía `dateManager`), no UTC del servidor.
     * - Suscripción gym-activa = semántica `getSubscriptionIsActiveSql`
     *   (`endDate` vigente + no cancelada + pago NOT IN (`voided`,`invalid`)).
     *   Un pago `processing` SÍ cuenta como activa: el acceso aún no fue
     *   revocado, solo está pendiente de validación manual.
     * - `withPortal`: espejo exacto de `countActivePortalUsers`
     *   (`userId NOT NULL + isActive + role member`).
     */
    async getMemberStats(organizationId: string, dateManager: OrganizationDateManager, now: Date = new Date()) {
      const memberScope = and(
        eq(gymMember.organizationId, organizationId),
        eq(gymMember.role, 'member')
      );

      const [counts] = await db
        .select({
          total: sql<number>`count(*)::int`,
          active: sql<number>`count(*) FILTER (WHERE ${gymMember.isActive})::int`,
          inactive: sql<number>`count(*) FILTER (WHERE NOT ${gymMember.isActive})::int`,
          newThisMonth: sql<number>`count(*) FILTER (WHERE DATE_TRUNC('month', ${dateManager.toLocalSql(gymMember.createdAt)}) = DATE_TRUNC('month', ${dateManager.toLocalValueSql(now)}))::int`,
        })
        .from(gymMember)
        .where(memberScope);

      // Miembros con al menos una suscripción gym-activa (subconsulta anti-join).
      const activeSubs = db
        .select({ memberId: subscription.memberId })
        .from(subscription)
        .innerJoin(payment, eq(payment.subscriptionId, subscription.id))
        .where(
          and(
            eq(subscription.organizationId, organizationId),
            subsRepo.getSubscriptionIsActiveSql(now)
          )
        )
        .as('active_subs');

      const [withoutSub] = await db
        .select({ value: sql<number>`count(*)::int` })
        .from(gymMember)
        .leftJoin(activeSubs, eq(activeSubs.memberId, gymMember.id))
        .where(
          and(
            eq(gymMember.organizationId, organizationId),
            eq(gymMember.role, 'member'),
            isNull(activeSubs.memberId)
          )
        );

      const [portal] = await db
        .select({ value: sql<number>`count(*)::int` })
        .from(gymMember)
        .where(
          and(
            eq(gymMember.organizationId, organizationId),
            sql`${gymMember.userId} IS NOT NULL`,
            eq(gymMember.isActive, true),
            eq(gymMember.role, 'member')
          )
        );

      const [growth, upcomingBirthdays] = await Promise.all([
        this.getMemberGrowth(organizationId, dateManager),
        this.getUpcomingBirthdays(organizationId, dateManager),
      ]);

      return {
        total: counts?.total ?? 0,
        active: counts?.active ?? 0,
        inactive: counts?.inactive ?? 0,
        newThisMonth: counts?.newThisMonth ?? 0,
        withoutActiveSubscription: withoutSub?.value ?? 0,
        withPortal: portal?.value ?? 0,
        growth,
        upcomingBirthdays,
      };
    },

    /**
     * Altas por mes local ('YYYY-MM'). Ventana de 6 meses calendario
     * (agregado SQL con `AT TIME ZONE` vía `dateManager`); los meses sin
     * altas no generan bucket (el frontend rellena los huecos con 0).
     */
    async getMemberGrowth(organizationId: string, dateManager: OrganizationDateManager) {
      const windowStart = dateManager.getStartOfMonthUtc(5);
      const rows = await db
        .select({
          month: dateManager.formatMonthSql(gymMember.createdAt),
          count: sql<number>`count(*)::int`,
        })
        .from(gymMember)
        .where(
          and(
            eq(gymMember.organizationId, organizationId),
            eq(gymMember.role, 'member'),
            gte(gymMember.createdAt, windowStart)
          )
        )
        .groupBy(sql`1`)
        .orderBy(sql`1`);
      return rows.map((r) => ({ month: r.month, count: Number(r.count) }));
    },

    /**
     * Próximos cumpleaños (top 5, solo `role = 'member'` con fecha).
     * La columna es `date` sin tz: se ordena por MM-DD con vuelta de año
     * (los que ya pasaron este año van al final).
     */
    async getUpcomingBirthdays(organizationId: string, dateManager: OrganizationDateManager, limit = 5) {
      const todayMonthDay = dateManager.getTodayLocalString().slice(5);
      const monthDay = sql<string>`TO_CHAR(${gymMember.birthday}, 'MM-DD')`;
      const rows = await db
        .select({
          id: gymMember.id,
          firstName: gymMember.firstName,
          lastName: gymMember.lastName,
          birthday: gymMember.birthday,
        })
        .from(gymMember)
        .where(
          and(
            eq(gymMember.organizationId, organizationId),
            eq(gymMember.role, 'member'),
            isNotNull(gymMember.birthday)
          )
        )
        .orderBy(sql`CASE WHEN ${monthDay} >= ${todayMonthDay} THEN 0 ELSE 1 END`, monthDay)
        .limit(limit);
      return rows.map((r) => ({
        id: r.id,
        firstName: r.firstName,
        lastName: r.lastName,
        birthday: r.birthday as string,
      }));
    },

    async countByRole(organizationId: string) {
      const results = await db
        .select({
          roleName: authMember.role,
          count: count(),
        })
        .from(gymMember)
        .innerJoin(
          authMember,
          and(
            eq(authMember.userId, gymMember.userId),
            eq(authMember.organizationId, organizationId)
          )
        )
        .where(eq(gymMember.organizationId, organizationId))
        .groupBy(authMember.role);

      return results.map((r) => ({
        roleId: r.roleName,
        count: Number(r.count),
      }));
    },

    async addToOrganization(userId: string, organizationId: string, role: OrgRole) {
      const id = crypto.randomUUID();
      const [newAuthMember] = await db
        .insert(authMember)
        .values({
          id,
          userId,
          organizationId,
          role,
        })
        .onConflictDoNothing()
        .returning();

      return newAuthMember;
    },

    async updateAuthRole(userId: string, organizationId: string, role: OrgRole) {
      const [updated] = await db
        .update(authMember)
        .set({ role })
        .where(and(eq(authMember.userId, userId), eq(authMember.organizationId, organizationId)))
        .returning();
      return updated;
    },

    async findAuthMember(userId: string, organizationId: string) {
      const [result] = await db
        .select()
        .from(authMember)
        .where(and(eq(authMember.userId, userId), eq(authMember.organizationId, organizationId)))
        .limit(1);
      return result;
    },
  };
}

export type MembersRepository = ReturnType<typeof createMembersRepository>;

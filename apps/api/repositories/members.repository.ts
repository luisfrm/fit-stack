import { eq, ilike, and, or, count, desc, db, isNotNull, ne } from '@workspace/database/client';
import crypto from "node:crypto";
import { gymMember, authMember, user } from '@workspace/database/schema';
import { OrgRole } from '@workspace/shared';

export type DbMember = typeof gymMember.$inferSelect;
export type NewDbMember = typeof gymMember.$inferInsert;

export type MemberWithRelations = DbMember & {
  user?: {
    id: string;
    email: string;
  } | null;
  role?: OrgRole | null;
};

export interface MembersFilter {
  organizationId: string;
  query?: string;
  role?: OrgRole;
  excludeRole?: OrgRole;
  isActive?: boolean;
  page?: number;
  limit?: number;
  requireTotal?: boolean;
}

export interface PaginatedMembersResult {
  data: MemberWithRelations[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const membersRepository = {
  async findAll(filters: MembersFilter): Promise<PaginatedMembersResult> {
    const { organizationId, query, role, excludeRole, isActive, page = 1, limit = 10 } = filters;
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
      conditions.push(eq(authMember.role, role));
    }

    if (excludeRole) {
      conditions.push(and(isNotNull(authMember.role), ne(authMember.role, excludeRole))!);
    }

    const whereClause = and(...conditions);

    const rows = await db
      .select({
        member: gymMember,
        role: authMember.role,
        user: {
          id: user.id,
          email: user.email,
        }
      })
      .from(gymMember)
      .leftJoin(authMember, and(
        eq(authMember.userId, gymMember.userId),
        eq(authMember.organizationId, organizationId)
      ))
      .leftJoin(user, eq(user.id, gymMember.userId))
      .where(whereClause)
      .orderBy(desc(gymMember.createdAt))
      .limit(limit)
      .offset(offset);

    const countResult = await db
      .select({ total: count() })
      .from(gymMember)
      .leftJoin(authMember, and(
        eq(authMember.userId, gymMember.userId),
        eq(authMember.organizationId, organizationId)
      ))
      .where(whereClause);

    const total = Number(countResult[0]?.total ?? 0);

    return {
      data: rows.map(r => ({ ...r.member, role: r.role, user: r.user })),
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
        role: authMember.role,
        user: {
          id: user.id,
          email: user.email,
        }
      })
      .from(gymMember)
      .leftJoin(authMember, and(
        eq(authMember.userId, gymMember.userId),
        eq(authMember.organizationId, organizationId)
      ))
      .leftJoin(user, eq(user.id, gymMember.userId))
      .where(and(eq(gymMember.id, id), eq(gymMember.organizationId, organizationId)))
      .limit(1);

    if (result.length === 0 || !result[0]) return undefined;
    return { ...result[0].member, role: result[0].role, user: result[0].user };
  },

  async findByEmail(organizationId: string, email: string) {
    return db.query.gymMember.findFirst({
      where: and(eq(gymMember.email, email), eq(gymMember.organizationId, organizationId)),
    });
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

  async countActive(organizationId: string, _gymNow: Date) {
    const result = await db
      .select({ value: count() })
      .from(gymMember)
      .where(and(eq(gymMember.organizationId, organizationId), eq(gymMember.isActive, true)));
    return Number(result[0]?.value ?? 0);
  },

  async countByRole(organizationId: string) {
    const results = await db
      .select({
        roleName: authMember.role,
        count: count()
      })
      .from(gymMember)
      .innerJoin(authMember, and(
        eq(authMember.userId, gymMember.userId),
        eq(authMember.organizationId, organizationId)
      ))
      .where(eq(gymMember.organizationId, organizationId))
      .groupBy(authMember.role);

    return results.map(r => ({
      roleId: r.roleName,
      count: Number(r.count)
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
  }
};

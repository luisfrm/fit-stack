import { eq, ilike, and, or, count, desc, db, isNull, ne } from '@workspace/database/client';
import { gymMembers, authMember, user } from '@workspace/database/schema';

export type DbMember = typeof gymMembers.$inferSelect;
export type NewDbMember = typeof gymMembers.$inferInsert;

export type MemberWithRelations = DbMember & {
  user?: {
    id: string;
    email: string;
  } | null;
  authRole?: string | null;
};

export interface MembersFilter {
  organizationId: string;
  query?: string;
  role?: string;
  excludeRole?: string;
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

    const conditions = [eq(gymMembers.organizationId, organizationId)];

    if (query) {
      conditions.push(
        or(
          ilike(gymMembers.firstName, `%${query}%`),
          ilike(gymMembers.lastName, `%${query}%`),
          ilike(gymMembers.email, `%${query}%`),
          ilike(gymMembers.documentId, `%${query}%`)
        )!
      );
    }

    if (isActive !== undefined) {
      conditions.push(eq(gymMembers.isActive, isActive));
    }

    if (role) {
      conditions.push(eq(authMember.role, role));
    }

    if (excludeRole) {
      conditions.push(or(isNull(authMember.role), ne(authMember.role, excludeRole))!);
    }

    const whereClause = and(...conditions);

    const rows = await db
      .select({
        member: gymMembers,
        authRole: authMember.role,
        user: {
          id: user.id,
          email: user.email,
        }
      })
      .from(gymMembers)
      .leftJoin(authMember, and(
        eq(authMember.userId, gymMembers.userId),
        eq(authMember.organizationId, organizationId)
      ))
      .leftJoin(user, eq(user.id, gymMembers.userId))
      .where(whereClause)
      .orderBy(desc(gymMembers.createdAt))
      .limit(limit)
      .offset(offset);

    const countResult = await db
      .select({ total: count() })
      .from(gymMembers)
      .leftJoin(authMember, and(
        eq(authMember.userId, gymMembers.userId),
        eq(authMember.organizationId, organizationId)
      ))
      .where(whereClause);

    const total = Number(countResult[0]?.total ?? 0);

    return {
      data: rows.map(r => ({ ...r.member, authRole: r.authRole, user: r.user })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  },

  async findById(organizationId: string, id: number): Promise<MemberWithRelations | undefined> {
    const result = await db
      .select({
        member: gymMembers,
        authRole: authMember.role,
        user: {
          id: user.id,
          email: user.email,
        }
      })
      .from(gymMembers)
      .leftJoin(authMember, and(
        eq(authMember.userId, gymMembers.userId),
        eq(authMember.organizationId, organizationId)
      ))
      .leftJoin(user, eq(user.id, gymMembers.userId))
      .where(and(eq(gymMembers.id, id), eq(gymMembers.organizationId, organizationId)))
      .limit(1);

    if (result.length === 0 || !result[0]) return undefined;
    return { ...result[0].member, authRole: result[0].authRole, user: result[0].user };
  },

  async findByEmail(organizationId: string, email: string) {
    return db.query.gymMembers.findFirst({
      where: and(eq(gymMembers.email, email), eq(gymMembers.organizationId, organizationId)),
    });
  },

  async create(data: NewDbMember) {
    const [newMember] = await db.insert(gymMembers).values(data).returning();
    return newMember;
  },

  async update(organizationId: string, id: number, data: Partial<NewDbMember>) {
    const [updatedMember] = await db
      .update(gymMembers)
      .set(data)
      .where(and(eq(gymMembers.id, id), eq(gymMembers.organizationId, organizationId)))
      .returning();
    return updatedMember;
  },

  async delete(organizationId: string, id: number) {
    await db.delete(gymMembers).where(and(eq(gymMembers.id, id), eq(gymMembers.organizationId, organizationId)));
  },

  async countActive(organizationId: string, _gymNow: Date) {
    const result = await db
      .select({ value: count() })
      .from(gymMembers)
      .where(and(eq(gymMembers.organizationId, organizationId), eq(gymMembers.isActive, true)));
    return Number(result[0]?.value ?? 0);
  },

  async countByRole(organizationId: string) {
    const results = await db
      .select({
        roleName: authMember.role,
        count: count()
      })
      .from(gymMembers)
      .innerJoin(authMember, and(
        eq(authMember.userId, gymMembers.userId),
        eq(authMember.organizationId, organizationId)
      ))
      .where(eq(gymMembers.organizationId, organizationId))
      .groupBy(authMember.role);

    return results.map(r => ({
      roleId: r.roleName,
      count: Number(r.count)
    }));
  }
};

import { eq, ilike, and, or, count, desc, db } from '@workspace/database/client';
import { organization, storeSubscription, fitstackPlan, authMember } from '@workspace/database/schema';
import { IPlatformOrganization } from '@workspace/shared/types';

export type DbOrganization = typeof organization.$inferSelect;
export type NewDbOrganization = typeof organization.$inferInsert;

export interface OrganizationFilter {
  query?: string;
  page?: number;
  limit?: number;
  includeMemberCount?: boolean;
}

export interface PaginatedOrganizationsResult {
  data: IPlatformOrganization[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const organizationsRepository = {
  async findAll(filters: OrganizationFilter): Promise<PaginatedOrganizationsResult> {
    const { query, page = 1, limit = 10 } = filters;
    const offset = (page - 1) * limit;

    const conditions = [];

    if (query) {
      conditions.push(
        or(
          ilike(organization.name, `%${query}%`),
          ilike(organization.slug, `%${query}%`)
        )!
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // First, get paginated organizations
    const orgs = await db
      .select()
      .from(organization)
      .where(whereClause)
      .orderBy(desc(organization.createdAt))
      .limit(limit)
      .offset(offset);

    // Get total count
    const countResult = await db
      .select({ total: count() })
      .from(organization)
      .where(whereClause);
    
    const total = Number(countResult[0]?.total ?? 0);

    // Enriched with latest subscription for each org
    const enrichedData: IPlatformOrganization[] = await Promise.all(
      orgs.map(async (org) => {
        // 1. Subscription fetch
        const [latestSub] = await db
          .select({
            id: storeSubscription.id,
            organizationId: storeSubscription.organizationId,
            planId: storeSubscription.planId,
            status: storeSubscription.status,
            startDate: storeSubscription.startDate,
            endDate: storeSubscription.currentPeriodEnd,
            isTrial: storeSubscription.isTrial,
            priceOverride: storeSubscription.priceOverride,
            createdAt: storeSubscription.createdAt,
            planName: fitstackPlan.name,
          })
          .from(storeSubscription)
          .leftJoin(fitstackPlan, eq(storeSubscription.planId, fitstackPlan.id))
          .where(eq(storeSubscription.organizationId, org.id))
          .orderBy(desc(storeSubscription.createdAt))
          .limit(1);

        // 2. Optional Member Count
        let memberCountNum: number | undefined = undefined;
        if (filters.includeMemberCount) {
          const [mCount] = await db
            .select({ total: count() })
            .from(authMember)
            .where(eq(authMember.organizationId, org.id));
          memberCountNum = Number(mCount?.total || 0);
        }

        return {
          id: org.id,
          name: org.name,
          slug: org.slug,
          logo: org.logo,
          countryCode: org.countryCode,
          taxId: org.taxId,
          legalName: org.legalName,
          address: org.address,
          fiscalConfig: org.fiscalConfig as Record<string, any> | null,
          createdAt: org.createdAt,
          updatedAt: org.updatedAt,
          metadata: org.metadata as Record<string, any> | null,
          memberCount: memberCountNum,
          latestSubscription: latestSub ? {
            ...latestSub,
            startDate: latestSub.startDate.toISOString(),
            endDate: latestSub.endDate.toISOString(),
            createdAt: latestSub.createdAt.toISOString(),
            status: latestSub.status as any,
            priceOverride: latestSub.priceOverride ? Number(latestSub.priceOverride) : null,
            planName: latestSub.planName || undefined,
          } : null,
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

  async findById(id: string): Promise<DbOrganization | undefined> {
    const [result] = await db
      .select()
      .from(organization)
      .where(eq(organization.id, id))
      .limit(1);
    
    return result;
  },

  async findBySlug(slug: string): Promise<DbOrganization | undefined> {
    const [result] = await db
      .select()
      .from(organization)
      .where(eq(organization.slug, slug))
      .limit(1);
    
    return result;
  },

  async create(data: NewDbOrganization) {
    const [newOrg] = await db.insert(organization).values(data).returning();
    return newOrg;
  },

  async update(id: string, data: Partial<NewDbOrganization>) {
    const [updatedOrg] = await db
      .update(organization)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(organization.id, id))
      .returning();
    return updatedOrg;
  },

  async delete(id: string) {
    await db.delete(organization).where(eq(organization.id, id));
  }
};

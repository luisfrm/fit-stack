import { eq, ilike, and, or, count, desc, type Db } from '@workspace/database/factory';
import {
  organization,
  platformSubscription,
  platformPlan,
  authMember,
  gymMember,
} from '@workspace/database/schema';
import type { IPlatformOrganization, IPlatformSubscription } from '@workspace/shared/types';
import {
  computePlatformSubscriptionStatus,
  PLATFORM_SUBSCRIPTION_STATUSES,
} from '@workspace/shared/constants';

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

export function createOrganizationsRepository(db: Db) {
  return {
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

      const orgs = await db
        .select()
        .from(organization)
        .where(whereClause)
        .orderBy(desc(organization.createdAt))
        .limit(limit)
        .offset(offset);

      const countResult = await db
        .select({ total: count() })
        .from(organization)
        .where(whereClause);

      const total = Number(countResult[0]?.total ?? 0);

      const enrichedData: IPlatformOrganization[] = await Promise.all(
        orgs.map(async (org) => {
          const [latestSub] = await db
            .select({
              id: platformSubscription.id,
              organizationId: platformSubscription.organizationId,
              planId: platformSubscription.planId,
              startDate: platformSubscription.startDate,
              currentPeriodEnd: platformSubscription.currentPeriodEnd,
              isTrial: platformSubscription.isTrial,
              priceOverride: platformSubscription.priceOverride,
              cancelledAt: platformSubscription.cancelledAt,
              createdAt: platformSubscription.createdAt,
              planName: platformPlan.name,
              planPrice: platformPlan.price,
              planCurrency: platformPlan.currency,
              planDurationValue: platformPlan.durationValue,
              planDurationUnit: platformPlan.durationUnit,
            })
            .from(platformSubscription)
            .leftJoin(platformPlan, eq(platformSubscription.planId, platformPlan.id))
            .where(eq(platformSubscription.organizationId, org.id))
            .orderBy(desc(platformSubscription.createdAt))
            .limit(1);

          // Computar status (no se guarda en DB)
          const computedStatus = latestSub
            ? computePlatformSubscriptionStatus({
                currentPeriodEnd: latestSub.currentPeriodEnd,
                cancelledAt: latestSub.cancelledAt,
                isTrial: latestSub.isTrial,
              })
            : PLATFORM_SUBSCRIPTION_STATUSES.CANCELLED;

          let memberCountNum: number | undefined = undefined;
          let userCountNum: number | undefined = undefined;

          if (filters.includeMemberCount) {
            const [mCount] = await db
              .select({ total: count() })
              .from(gymMember)
              .where(eq(gymMember.organizationId, org.id));
            memberCountNum = Number(mCount?.total || 0);

            const [uCount] = await db
              .select({ total: count() })
              .from(authMember)
              .where(eq(authMember.organizationId, org.id));
            userCountNum = Number(uCount?.total || 0);
          }

          let subscriptionDto: (IPlatformSubscription & { planName?: string }) | null = null;
          if (latestSub) {
            subscriptionDto = {
              id: latestSub.id,
              organizationId: latestSub.organizationId,
              planId: latestSub.planId,
              startDate: latestSub.startDate.toISOString(),
              currentPeriodEnd: latestSub.currentPeriodEnd.toISOString(),
              isTrial: latestSub.isTrial,
              priceOverride: latestSub.priceOverride ?? null,
              cancelledAt: latestSub.cancelledAt?.toISOString() ?? null,
              createdAt: latestSub.createdAt.toISOString(),
              status: computedStatus,
              planName: latestSub.planName ?? undefined,
              planPrice: latestSub.planPrice ?? undefined,
              planCurrency: latestSub.planCurrency ?? undefined,
              planDurationValue: latestSub.planDurationValue ?? undefined,
              planDurationUnit: (latestSub.planDurationUnit ?? undefined) as "day" | "week" | "month" | "year" | undefined,
            };
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
            userCount: userCountNum,
            latestSubscription: subscriptionDto,
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
    },
  };
}

export type OrganizationsRepository = ReturnType<typeof createOrganizationsRepository>;

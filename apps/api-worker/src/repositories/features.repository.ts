import { eq, and, sql, type Db } from '@workspace/database/factory';
import { gymMember, invitation, aiUsage, subscription, payment } from '@workspace/database/schema';
import { PAYMENT_STATUSES } from '@workspace/shared/constants';

// Monthly period by subscription cycle (or calendar if no subscription exists).
export interface AiCreditPeriod {
  periodStart: Date;
}

/** Start of calendar month in UTC (for orgs without subscription). */
export function startOfMonthUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/**
 * Start of subscription billing cycle.
 * currentPeriodEnd is the end of current cycle (start + duration).
 */
export function startOfSubscriptionPeriod(
  currentPeriodEnd: Date,
  durationValue: number,
  durationUnit: string,
): Date {
  const end = new Date(currentPeriodEnd);
  const start = new Date(end);
  switch (durationUnit) {
    case 'day':
      start.setUTCDate(end.getUTCDate() - durationValue);
      break;
    case 'week':
      start.setUTCDate(end.getUTCDate() - durationValue * 7);
      break;
    case 'month':
      start.setUTCMonth(end.getUTCMonth() - durationValue);
      break;
    case 'year':
      start.setUTCFullYear(end.getUTCFullYear() - durationValue);
      break;
    default:
      start.setUTCMonth(end.getUTCMonth() - 1);
  }
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
}

export function createFeaturesRepository(db: Db) {
  return {
    // ── AI Credits (1 credit = 1K tokens, x1.0) ──
    async getMonthlyCredits(orgId: string, periodStart: Date): Promise<number> {
      const [row] = await db
        .select({ credits: aiUsage.credits })
        .from(aiUsage)
        .where(
          and(
            eq(aiUsage.organizationId, orgId),
            eq(aiUsage.periodType, 'monthly'),
            eq(aiUsage.periodStart, periodStart),
          ),
        );
      return row?.credits ?? 0;
    },

    async getPeriodUsage(orgId: string, periodStart: Date): Promise<{ credits: number; bonusCredits: number }> {
      const [row] = await db
        .select({ credits: aiUsage.credits, bonusCredits: aiUsage.bonusCredits })
        .from(aiUsage)
        .where(
          and(
            eq(aiUsage.organizationId, orgId),
            eq(aiUsage.periodType, 'monthly'),
            eq(aiUsage.periodStart, periodStart),
          ),
        );
      return { credits: row?.credits ?? 0, bonusCredits: row?.bonusCredits ?? 0 };
    },

    async grantBonusCredits(orgId: string, periodStart: Date, delta: number): Promise<{ credits: number; bonusCredits: number }> {
      const [row] = await db
        .insert(aiUsage)
        .values({
          organizationId: orgId,
          periodType: 'monthly',
          periodStart,
          credits: 0,
          bonusCredits: delta,
          count: 0,
        })
        .onConflictDoUpdate({
          target: [aiUsage.organizationId, aiUsage.periodType, aiUsage.periodStart],
          set: {
            bonusCredits: sql`${aiUsage.bonusCredits} + ${delta}`,
            updatedAt: new Date(),
          },
        })
        .returning({ credits: aiUsage.credits, bonusCredits: aiUsage.bonusCredits });
      return { credits: row?.credits ?? 0, bonusCredits: row?.bonusCredits ?? delta };
    },

    /**
     * Atomic increment of cycle credits (INSERT ... ON CONFLICT DO UPDATE).
     * With cap: fails if credits + delta > limit (0 = unlimited → no cap).
     * Returns { credits, capped }.
     */
    async consumeCredits(
      orgId: string,
      periodStart: Date,
      delta: number,
      limit: number,
    ): Promise<{ credits: number; capped: boolean }> {
      if (limit > 0) {
        const [row] = await db
          .insert(aiUsage)
          .values({
            organizationId: orgId,
            periodType: 'monthly',
            periodStart,
            credits: delta,
            count: 0,
          })
          .onConflictDoUpdate({
            target: [aiUsage.organizationId, aiUsage.periodType, aiUsage.periodStart],
            set: {
              credits: sql`${aiUsage.credits} + ${delta}`,
              updatedAt: new Date(),
            },
          })
          .returning({ credits: aiUsage.credits });

        const credits = row?.credits ?? delta;
        if (credits > limit) {
          // Partial rollback: subtract delta (no transaction, but overshoot is bounded by pre-flight check)
          await db
            .update(aiUsage)
            .set({ credits: sql`${aiUsage.credits} - ${delta}`, updatedAt: new Date() })
            .where(
              and(
                eq(aiUsage.organizationId, orgId),
                eq(aiUsage.periodType, 'monthly'),
                eq(aiUsage.periodStart, periodStart),
              ),
            );
          return { credits: credits - delta, capped: true };
        }
        return { credits, capped: false };
      }

      const [row] = await db
        .insert(aiUsage)
        .values({
          organizationId: orgId,
          periodType: 'monthly',
          periodStart,
          credits: delta,
          count: 0,
        })
        .onConflictDoUpdate({
          target: [aiUsage.organizationId, aiUsage.periodType, aiUsage.periodStart],
          set: {
            credits: sql`${aiUsage.credits} + ${delta}`,
            updatedAt: new Date(),
          },
        })
        .returning({ credits: aiUsage.credits });

      return { credits: row?.credits ?? delta, capped: false };
    },

    async incrementCredits(orgId: string, periodStart: Date, delta: number): Promise<number> {
      const [row] = await db
        .insert(aiUsage)
        .values({
          organizationId: orgId,
          periodType: 'monthly',
          periodStart,
          credits: delta,
          count: 0,
        })
        .onConflictDoUpdate({
          target: [aiUsage.organizationId, aiUsage.periodType, aiUsage.periodStart],
          set: {
            credits: sql`${aiUsage.credits} + ${delta}`,
            updatedAt: new Date(),
          },
        })
        .returning({ credits: aiUsage.credits });
      return row?.credits ?? delta;
    },

    // Legacy: maintain compatibility with older tests reading count (not used in production)
    async getLegacyCounts(orgId: string, periodStart: Date): Promise<number> {
      const [row] = await db
        .select({ count: aiUsage.count })
        .from(aiUsage)
        .where(
          and(
            eq(aiUsage.organizationId, orgId),
            eq(aiUsage.periodType, 'monthly'),
            eq(aiUsage.periodStart, periodStart),
          ),
        );
      return row?.count ?? 0;
    },

    /**
     * Active members with linked accounts (userId) — portal seat usage.
     */
    async countActivePortalUsers(orgId: string): Promise<number> {
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(gymMember)
        .where(
          and(
            eq(gymMember.organizationId, orgId),
            sql`${gymMember.userId} IS NOT NULL`,
            eq(gymMember.isActive, true),
            eq(gymMember.role, 'member')
          )
        );
      return row?.count ?? 0;
    },

    /**
     * Gym adoption: registered members (role member) and how many have
     * at least one active gym subscription (valid endDate, not cancelled,
     * payment not voided/rejected). Base for the % outside Member Platform.
     */
    async getGymAdoption(orgId: string): Promise<{
      totalMembers: number;
      activeSubMembers: number;
    }> {
      const [totals] = await db
        .select({ totalMembers: sql<number>`count(*)::int` })
        .from(gymMember)
        .where(
          and(eq(gymMember.organizationId, orgId), eq(gymMember.role, 'member')),
        );

      const [active] = await db
        .select({ activeSubMembers: sql<number>`COUNT(DISTINCT ${subscription.memberId})::int` })
        .from(subscription)
        .innerJoin(payment, eq(payment.subscriptionId, subscription.id))
        .where(
          and(
            eq(subscription.organizationId, orgId),
            sql`${subscription.endDate} >= CURRENT_TIMESTAMP`,
            sql`${subscription.cancelledAt} IS NULL`,
            sql`${payment.status} <> ${PAYMENT_STATUSES.VOIDED}`,
          ),
        );

      return {
        totalMembers: totals?.totalMembers ?? 0,
        activeSubMembers: active?.activeSubMembers ?? 0,
      };
    },

    /**
     * Pending portal invitations (Better Auth invitation, status pending).
     */
    async countPendingInvitations(orgId: string): Promise<number> {
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(invitation)
        .where(
          and(
            eq(invitation.organizationId, orgId),
            eq(invitation.status, 'pending'),
            eq(invitation.role, 'member')
          )
        );
      return row?.count ?? 0;
    },
  };
}

export type FeaturesRepository = ReturnType<typeof createFeaturesRepository>;

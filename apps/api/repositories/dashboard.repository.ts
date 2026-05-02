import { db, sql, and, eq, or, gte, count, sum, isNull, lte } from '@workspace/database/client';
import { subscription, payment, cmsClass } from '@workspace/database/schema';
import { OrganizationDateManager } from '../lib/date-manager';

export interface DashboardStats {
  activeMembers: number;
  classesToday: number;
  monthlyIncome: Record<string, number>;
  membershipsExpiring: number;
}

export const dashboardRepository = {
  async getStats(organizationId: string, today: string, dateManager: OrganizationDateManager, now: Date = new Date()): Promise<DashboardStats> {
    const sevenDaysFromNow = new Date(now);
    sevenDaysFromNow.setDate(now.getDate() + 7);

    // 1. Monthly Income (Groups of totals per currency)
    // Using Postgres AT TIME ZONE to ensure we capture exactly the current local month
    const incomeResults = await db
      .select({ 
        currency: payment.currencyPaid, 
        total: sum(payment.amountPaid) 
      })
      .from(payment)
      .where(and(
        eq(payment.organizationId, organizationId),
        eq(payment.status, 'validated'),
        sql`DATE_TRUNC('month', ${dateManager.toLocalSql(payment.paymentDate)}) = DATE_TRUNC('month', ${dateManager.toLocalValueSql(now)})`
      ))
      .groupBy(payment.currencyPaid);

    const monthlyIncome: Record<string, number> = {};
    incomeResults.forEach(row => {
      if (row.currency) {
        monthlyIncome[row.currency] = Number(row.total ?? 0);
      }
    });

    // 2. Active Members (Unique members with at least one active, non-expired subscription)
    const activeMembersResult = await db
      .select({ count: count(sql`DISTINCT ${subscription.memberId}`) })
      .from(subscription)
      .innerJoin(payment, eq(subscription.id, payment.subscriptionId))
      .where(and(
        eq(subscription.organizationId, organizationId),
        gte(subscription.endDate, now),
        isNull(subscription.cancelledAt),
        eq(payment.status, 'validated')
      ));
    const activeMembers = Number(activeMembersResult[0]?.count ?? 0);

    // 3. Memberships Expiring (Unique members whose LATEST active subscription expires in < 7 days)
    // We use a subquery to find the max(end_date) per member
    const latestSubs = db
      .select({
        memberId: subscription.memberId,
        maxEndDate: sql<Date>`max(${subscription.endDate})`.as('max_end_date'),
      })
      .from(subscription)
      .innerJoin(payment, eq(subscription.id, payment.subscriptionId))
      .where(and(
        eq(subscription.organizationId, organizationId),
        gte(subscription.endDate, now),
        isNull(subscription.cancelledAt),
        eq(payment.status, 'validated')
      ))
      .groupBy(subscription.memberId)
      .as('latest_subs');

    const expiringSoonResult = await db
      .select({ total: count() })
      .from(latestSubs)
      .where(lte(latestSubs.maxEndDate, sevenDaysFromNow));
    
    const membershipsExpiring = Number(expiringSoonResult[0]?.total ?? 0);

    // 4. Classes Today
    // Truncate today's start and end in local time to check classes correctly
    const parts = today.split('-').map(Number);
    const [year = 0, month = 1, day = 1] = parts;
    const dateObj = new Date(year, month - 1, day);
    const dayOfWeek = dateObj.getDay();

    const classesTodayResult = await db
      .select({ count: count() })
      .from(cmsClass)
      .where(
        and(
          eq(cmsClass.organizationId, organizationId),
          eq(cmsClass.isVisible, true),
          or(
            and(
              eq(cmsClass.frequencyType, 'once'),
              eq(cmsClass.scheduledDate, today)
            ),
            and(
              eq(cmsClass.frequencyType, 'weekly'),
              sql`${dayOfWeek} = ANY(${cmsClass.daysOfWeek})`
            )
          )
        )
      );
    const classesToday = Number(classesTodayResult[0]?.count ?? 0);

    return {
      activeMembers,
      classesToday,
      monthlyIncome,
      membershipsExpiring,
    };
  }
};

import { eq, and, sql, type Db } from '@workspace/database/factory';
import { gymMember, invitation, aiUsage } from '@workspace/database/schema';

export interface AiPeriodStarts {
  daily: Date;
  weekly: Date;
  monthly: Date;
}

/** Inicio del día en UTC (determinista en serverless) */
function startOfDayUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Lunes de la semana (ISO 8601) en UTC */
function startOfWeekUtc(d: Date): Date {
  const day = d.getUTCDay();
  const diff = day === 0 ? 6 : day - 1; // domingo → lunes anterior
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff));
}

/** Primer día del mes en UTC */
function startOfMonthUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export function getAiPeriodStarts(now: Date = new Date()): AiPeriodStarts {
  return {
    daily: startOfDayUtc(now),
    weekly: startOfWeekUtc(now),
    monthly: startOfMonthUtc(now),
  };
}

export function createFeaturesRepository(db: Db) {
  return {
    /**
     * Contadores de uso IA de la org para los 3 períodos.
     * Fuente de verdad: tabla ai_usage (upsert atómico por período).
     */
    async getAiUsageCounts(
      orgId: string,
      starts: AiPeriodStarts
    ): Promise<{ daily: number; weekly: number; monthly: number }> {
      const rows = await db
        .select({
          periodType: aiUsage.periodType,
          count: aiUsage.count,
          periodStart: aiUsage.periodStart,
        })
        .from(aiUsage)
        .where(
          and(
            eq(aiUsage.organizationId, orgId),
            sql`(${aiUsage.periodType} = 'daily' AND ${aiUsage.periodStart} = ${starts.daily}) OR (${aiUsage.periodType} = 'weekly' AND ${aiUsage.periodStart} = ${starts.weekly}) OR (${aiUsage.periodType} = 'monthly' AND ${aiUsage.periodStart} = ${starts.monthly})`
          )
        );

      const counts: { daily: number; weekly: number; monthly: number } = { daily: 0, weekly: 0, monthly: 0 };
      for (const row of rows) {
        counts[row.periodType as 'daily' | 'weekly' | 'monthly'] = row.count;
      }
      return counts;
    },

    /**
     * Incremento atómico del contador de un período (INSERT ... ON CONFLICT DO UPDATE).
     * Devuelve el count resultante.
     */
    async incrementAiUsage(orgId: string, periodType: string, periodStart: Date): Promise<number> {
      const [row] = await db
        .insert(aiUsage)
        .values({
          organizationId: orgId,
          periodType,
          periodStart,
          count: 1,
        })
        .onConflictDoUpdate({
          target: [aiUsage.organizationId, aiUsage.periodType, aiUsage.periodStart],
          set: {
            count: sql`${aiUsage.count} + 1`,
            updatedAt: new Date(),
          },
        })
        .returning({ count: aiUsage.count });

      return row?.count ?? 0;
    },

    /**
     * Miembros activos con cuenta vinculada (userId) — cupos usados del portal.
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
     * Invitaciones pendientes del portal (Better Auth invitation, status pending).
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
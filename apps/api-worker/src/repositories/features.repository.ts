import { eq, and, sql, type Db } from '@workspace/database/factory';
import { gymMember, invitation, aiUsage } from '@workspace/database/schema';

// Período mensual por ciclo de suscripción (o calendario si no hay sub).
export interface AiCreditPeriod {
  periodStart: Date;
}

/** Inicio del mes calendario en UTC (para orgs sin suscripción). */
export function startOfMonthUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/**
 * Inicio del ciclo de facturación de la suscripción.
 * currentPeriodEnd es el fin del ciclo actual (start + duration).
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
    // ── Créditos IA (1 crédito = 1K tokens, x1.0) ──
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

    /**
     * Incremento atómico de créditos del ciclo (INSERT ... ON CONFLICT DO UPDATE).
     * Con cap: falla si credits + delta > limit (0 = ilimitado → sin cap).
     * Devuelve { credits, capped }.
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
          // Rollback parcial: resta delta (no hay transacción, pero el overshoot es acotado por el pre-flight)
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

    // Legado: mantener compat con tests viejos que leen count (no usado en producción)
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

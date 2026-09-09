import { addDuration, toLocalMonthString } from "@workspace/shared/date";
import type { IPlatformOrganization } from "@workspace/shared/types";
import type { SubscriptionWithDetails } from "@/lib/services/platform-subscriptions-service";

/**
 * Selectores puros para los widgets del dashboard de console.
 *
 * Se derivan de datos ya disponibles (organizaciones con `latestSubscription`
 * y suscripciones recientes) para no agregar endpoints al backend.
 * Todas las fechas usan los helpers de `@workspace/shared/date`; el corte de
 * mes es UTC porque el billing SaaS opera en UTC.
 */

/** Tope de filas por widget (la paginación local muestra de a 10). */
export const DASHBOARD_WIDGET_LIMIT = 30;

/** Filas por página dentro de cada widget. */
export const DASHBOARD_WIDGET_PAGE_SIZE = 10;

/** Ventana de "por vencer": 7 días (igual que `status=expiring` del backend). */
export const EXPIRING_WINDOW_DAYS = 7;

/** Timezone de referencia para cortes a nivel plataforma. */
const PLATFORM_TIMEZONE = "UTC";

export interface RenewalItem {
  readonly org: IPlatformOrganization;
  readonly urgency: "overdue" | "expiring";
  readonly periodEnd: Date;
}

export interface TrialItem {
  readonly org: IPlatformOrganization;
  readonly periodEnd: Date;
}

export interface TrialsSelection {
  readonly expiring: TrialItem[];
  readonly all: TrialItem[];
}

function toDate(value: string | Date | undefined | null): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Gimnasios creados en el mes calendario actual (UTC), más recientes primero.
 */
export function selectNewOrgsThisMonth(
  orgs: IPlatformOrganization[],
  now: Date = new Date(),
): IPlatformOrganization[] {
  const currentMonth = toLocalMonthString(PLATFORM_TIMEZONE, now);
  return orgs
    .filter((org) => {
      const createdAt = toDate(org.createdAt);
      return (
        createdAt !== null &&
        toLocalMonthString(PLATFORM_TIMEZONE, createdAt) === currentMonth
      );
    })
    .sort(
      (a, b) =>
        (toDate(b.createdAt)?.getTime() ?? 0) -
        (toDate(a.createdAt)?.getTime() ?? 0),
    )
    .slice(0, DASHBOARD_WIDGET_LIMIT);
}

/**
 * Gimnasios pendientes de renovar: primero vencidas (`past_due`/`read_only`/
 * `suspended`, la más vencida arriba) y luego por vencer (activas con fin
 * dentro de 7 días, la más próxima arriba). Excluye trials, canceladas y
 * organizaciones sin suscripción (free tier / sin plan).
 */
export function selectRenewals(
  orgs: IPlatformOrganization[],
  now: Date = new Date(),
): RenewalItem[] {
  const windowEnd = addDuration(
    now,
    EXPIRING_WINDOW_DAYS,
    "day",
    PLATFORM_TIMEZONE,
  );
  const overdue: RenewalItem[] = [];
  const expiring: RenewalItem[] = [];

  for (const org of orgs) {
    const sub = org.latestSubscription;
    if (!sub || sub.isTrial || sub.cancelledAt) continue;
    const periodEnd = toDate(sub.currentPeriodEnd);
    if (!periodEnd) continue;

    if (
      sub.status === "past_due" ||
      sub.status === "read_only" ||
      sub.status === "suspended"
    ) {
      overdue.push({ org, urgency: "overdue", periodEnd });
    } else if (
      sub.status === "active" &&
      periodEnd.getTime() > now.getTime() &&
      periodEnd.getTime() <= windowEnd.getTime()
    ) {
      expiring.push({ org, urgency: "expiring", periodEnd });
    }
  }

  overdue.sort((a, b) => a.periodEnd.getTime() - b.periodEnd.getTime());
  expiring.sort((a, b) => a.periodEnd.getTime() - b.periodEnd.getTime());
  return [...overdue, ...expiring].slice(0, DASHBOARD_WIDGET_LIMIT);
}

/**
 * Trials: `expiring` (fin dentro de 7 días, no cancelados) y `all`
 * (todos los trials no cancelados). Ambos ordenados por fin de periodo.
 */
export function selectTrials(
  orgs: IPlatformOrganization[],
  now: Date = new Date(),
): TrialsSelection {
  const windowEnd = addDuration(
    now,
    EXPIRING_WINDOW_DAYS,
    "day",
    PLATFORM_TIMEZONE,
  );
  const expiring: TrialItem[] = [];
  const all: TrialItem[] = [];

  for (const org of orgs) {
    const sub = org.latestSubscription;
    if (!sub || !sub.isTrial || sub.cancelledAt) continue;
    const periodEnd = toDate(sub.currentPeriodEnd);
    if (!periodEnd) continue;

    all.push({ org, periodEnd });
    if (
      periodEnd.getTime() > now.getTime() &&
      periodEnd.getTime() <= windowEnd.getTime()
    ) {
      expiring.push({ org, periodEnd });
    }
  }

  all.sort((a, b) => a.periodEnd.getTime() - b.periodEnd.getTime());
  expiring.sort((a, b) => a.periodEnd.getTime() - b.periodEnd.getTime());
  return {
    expiring: expiring.slice(0, DASHBOARD_WIDGET_LIMIT),
    all: all.slice(0, DASHBOARD_WIDGET_LIMIT),
  };
}

/**
 * Suscripciones con último pago en revisión (`processing`), más recientes primero.
 * La aprobación/rechazo vive en el detalle de la org (modal de historial de pagos).
 */
export function selectPaymentsReview(
  subs: SubscriptionWithDetails[],
): SubscriptionWithDetails[] {
  return subs
    .filter((sub) => sub.latestPaymentStatus === "processing")
    .sort(
      (a, b) =>
        (toDate(b.createdAt)?.getTime() ?? 0) -
        (toDate(a.createdAt)?.getTime() ?? 0),
    )
    .slice(0, DASHBOARD_WIDGET_LIMIT);
}

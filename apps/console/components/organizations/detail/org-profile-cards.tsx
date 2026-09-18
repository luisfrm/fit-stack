import * as React from "react";
import { Text } from "@workspace/ui/components";
import { CalendarCheck, Users, Rocket, Wallet } from "lucide-react";
import {
  FEATURE_CATALOG,
  formatFeatureLimits,
  resolveFeatures,
  type FeatureCatalog,
  type PlanFeaturesV2,
} from "@workspace/shared";
import { SubscriptionStatusBadge } from "@/components/platform/subscription-status-badge";
import {
  formatCents,
  type CurrencyFormat,
} from "@workspace/shared";
import { selectPortalAdoption } from "@/lib/platform/organization-selectors";
import {
  selectOrgBilledTotal,
  selectOrgCurrentMonth,
} from "@/lib/platform/subscription-selectors";
import type {
  SubscriptionWithDetails,
  PlatformPayment,
} from "@/lib/services/platform-subscriptions-service";
import type {
  OrgAiQuota,
  OrgGymOverview,
} from "@/lib/services/organizations-service";

const MAX_FEATURE_ROWS = 6;

interface OrgProfileCardsProps {
  readonly activeSub: SubscriptionWithDetails | null;
  readonly planFeatures: PlanFeaturesV2 | null;
  readonly catalog?: FeatureCatalog;
  readonly memberCount?: number;
  readonly userCount?: number;
  readonly gymOverview: OrgGymOverview | null;
  readonly aiQuota?: OrgAiQuota | null;
  readonly invoices: PlatformPayment[];
  readonly currencyFormat: CurrencyFormat;
  readonly currency: string;
}

function Card({
  title,
  icon,
  children,
  testId,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <section
      data-testid={testId}
      className="rounded-2xl border border-white/5 bg-white/5 p-5 flex flex-col gap-3"
    >
      <div className="flex items-center gap-2">
        {icon}
        <Text
          size="xs"
          variant="muted"
          className="uppercase font-black tracking-widest leading-none"
        >
          {title}
        </Text>
      </div>
      {children}
    </section>
  );
}

function formatDate(date: string | Date) {
  return new Date(date).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatCredits(value: number): string {
  if (value >= 1000)
    return `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}K`;
  return `${value}`;
}

export function OrgProfileCards({
  activeSub,
  planFeatures,
  catalog,
  memberCount,
  userCount,
  gymOverview,
  aiQuota,
  invoices,
  currencyFormat,
  currency,
}: OrgProfileCardsProps) {
  const adoption = gymOverview ? selectPortalAdoption(gymOverview) : null;
  const billed = selectOrgBilledTotal(invoices);
  const currentMonth = selectOrgCurrentMonth(invoices, new Date());
  const latest = [...invoices]
    .filter((p) => p.status === "validated")
    .sort((a, b) => +new Date(b.paymentDate) - +new Date(a.paymentDate))[0];

  const activeCatalog: FeatureCatalog = catalog ?? FEATURE_CATALOG;
  const resolvedPlan = resolveFeatures(planFeatures ?? null);
  const enabledFeatures = Object.entries(activeCatalog)
    .filter(
      ([id, def]) =>
        def.alwaysOn || resolvedPlan[id as keyof typeof resolvedPlan]?.enabled,
    )
    .map(([id, def]) => ({
      id,
      label: def.label,
      limits: formatFeatureLimits(
        resolvedPlan[id as keyof typeof resolvedPlan],
      ),
      alwaysOn: def.alwaysOn ?? false,
    }));
  const visibleFeatures = enabledFeatures.slice(0, MAX_FEATURE_ROWS);
  const hiddenCount = enabledFeatures.length - visibleFeatures.length;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      <Card
        title="Plan activo"
        icon={<CalendarCheck size={16} className="text-primary" />}
        testId="org-profile-plan"
      >
        {activeSub ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <Text weight="bold" className="uppercase tracking-tight truncate">
                {activeSub.planName ?? "Sin plan"}
              </Text>
              <SubscriptionStatusBadge status={activeSub.status} />
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <Text
                size="sm"
                weight="bold"
                className="tabular-nums text-primary"
              >
                {activeSub.isTrial
                  ? "Gratuito"
                  : formatCents(
                      activeSub.priceOverride ?? activeSub.planPrice ?? 0,
                      activeSub.planCurrency ?? currency,
                      currencyFormat,
                    )}
              </Text>
              <Text
                size="xs"
                variant="muted"
                className="opacity-60 tabular-nums"
              >
                hasta {formatDate(activeSub.currentPeriodEnd)}
              </Text>
            </div>
            <div className="h-px w-full bg-white/5" />
            <Text
              size="xs"
              variant="muted"
              className="uppercase tracking-widest font-bold opacity-60"
            >
              Features efectivas
            </Text>
            <div className="flex flex-col">
              {visibleFeatures.map((feature) => (
                <div
                  key={feature.id}
                  className="flex items-center justify-between gap-2 border-b border-white/5 py-1.5 last:border-b-0"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      aria-hidden
                      className="size-1.5 rounded-full bg-emerald-400 shrink-0"
                    />
                    <Text size="xs" className="truncate">
                      {feature.label}
                    </Text>
                  </div>
                  <Text
                    size="xs"
                    variant="muted"
                    className="opacity-60 truncate shrink-0 tabular-nums"
                  >
                    {feature.alwaysOn ? "Siempre" : (feature.limits ?? "Sí")}
                  </Text>
                </div>
              ))}
              {visibleFeatures.length === 0 && (
                <Text size="xs" variant="muted" className="opacity-60">
                  Sin features habilitadas.
                </Text>
              )}
              {hiddenCount > 0 && (
                <Text size="xs" variant="muted" className="opacity-60 pt-1">
                  +{hiddenCount} más en el detalle
                </Text>
              )}
            </div>
            <div className="h-px w-full bg-white/5" />
            <Text
              size="xs"
              variant="muted"
              className="uppercase tracking-widest font-bold opacity-60"
            >
              Créditos IA
            </Text>
            {!aiQuota || aiQuota.disabled ? (
              <Text size="xs" variant="muted" className="opacity-60">
                {!aiQuota ? "Sin datos." : "Chat IA desactivado en su plan."}
              </Text>
            ) : aiQuota.monthly.limit === 0 ? (
              <Text size="xs" className="tabular-nums">
                {formatCredits(aiQuota.monthly.used)} usados · Ilimitado
              </Text>
            ) : (
              <div className="flex items-baseline justify-between gap-2">
                <Text size="xs" className="tabular-nums">
                  {formatCredits(aiQuota.monthly.used)}/
                  {formatCredits(aiQuota.monthly.limit)} usados
                </Text>
                <Text
                  size="xs"
                  variant="muted"
                  className="opacity-60 tabular-nums"
                >
                  restan{" "}
                  {aiQuota.remaining === null
                    ? "—"
                    : formatCredits(aiQuota.remaining)}
                </Text>
              </div>
            )}
          </>
        ) : (
          <Text size="sm" variant="muted">
            Sin suscripción activa. Asígnale un plan para activar el servicio.
          </Text>
        )}
      </Card>

      <Card
        title="Miembros"
        icon={<Users size={16} className="text-blue-400" />}
        testId="org-profile-members"
      >
        <div className="flex items-end gap-5">
          <div>
            <Text size="lg" weight="bold" className="tabular-nums">
              {memberCount ?? "—"}
            </Text>
            <Text
              size="xs"
              variant="muted"
              className="uppercase tracking-widest opacity-60"
            >
              Registrados
            </Text>
          </div>
          <div>
            <Text
              size="lg"
              weight="bold"
              className="tabular-nums text-emerald-400"
            >
              {gymOverview?.activeSubMembers ?? "—"}
            </Text>
            <Text
              size="xs"
              variant="muted"
              className="uppercase tracking-widest opacity-60"
            >
              Con sub activa
            </Text>
          </div>
          <div>
            <Text size="lg" weight="bold" className="tabular-nums">
              {userCount ?? "—"}
            </Text>
            <Text
              size="xs"
              variant="muted"
              className="uppercase tracking-widest opacity-60"
            >
              Usuarios
            </Text>
          </div>
        </div>
        {memberCount != null &&
          memberCount > 0 &&
          gymOverview?.activeSubMembers != null && (
            <div className="flex flex-col gap-1.5">
              <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-400"
                  style={{
                    width: `${Math.min(100, Math.round((gymOverview.activeSubMembers / memberCount) * 100))}%`,
                  }}
                />
              </div>
              <Text
                size="xs"
                variant="muted"
                className="opacity-60 tabular-nums"
              >
                {Math.round((gymOverview.activeSubMembers / memberCount) * 100)}
                % de registrados con sub activa
              </Text>
            </div>
          )}
      </Card>

      <Card
        title="Adopción portal"
        icon={<Rocket size={16} className="text-emerald-400" />}
        testId="org-profile-adoption"
      >
        {adoption && gymOverview ? (
          <>
            <div className="flex items-baseline gap-1">
              <Text
                size="lg"
                weight="bold"
                className="tabular-nums text-orange-400"
              >
                {Math.max(0, gymOverview.activeSubMembers - adoption.inPortal)}
              </Text>
              <Text size="xs" variant="muted" className="opacity-60">
                clientes fuera del portal
                {adoption.outsidePct !== null && ` (${adoption.outsidePct}%)`}
              </Text>
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-orange-400"
                  style={{
                    width: `${adoption.outsidePct ?? 0}%`,
                  }}
                />
              </div>
              <Text
                size="xs"
                variant="muted"
                className="opacity-60 tabular-nums"
              >
                {adoption.inPortal} en portal · {adoption.pending} invitaciones
                pendientes · cupos {gymOverview.portal.used}/
                {gymOverview.portal.limit === 0
                  ? "∞"
                  : gymOverview.portal.limit}
              </Text>
            </div>
          </>
        ) : (
          <Text size="sm" variant="muted">
            Sin datos de adopción.
          </Text>
        )}
      </Card>

      <Card
        title="Facturación SaaS"
        icon={<Wallet size={16} className="text-primary" />}
        testId="org-profile-billing"
      >
        <Text size="lg" weight="bold" className="tabular-nums">
          {formatCents(billed.totalCents, currency, currencyFormat)}
        </Text>
        <Text size="xs" variant="muted" className="opacity-60 tabular-nums">
          {billed.count} pago(s) validados
          {latest
            ? ` · último ${formatCents(latest.baseAmount ?? latest.amountPaid, latest.currencyPaid, currencyFormat)} el ${formatDate(latest.paymentDate)}`
            : ""}
        </Text>
        <div className="flex items-end gap-5">
          <div>
            <Text size="sm" weight="bold" className="tabular-nums">
              {billed.count > 0
                ? formatCents(
                    Math.round(billed.totalCents / billed.count),
                    currency,
                    currencyFormat,
                  )
                : "—"}
            </Text>
            <Text
              size="xs"
              variant="muted"
              className="uppercase tracking-widest opacity-60"
            >
              Ticket promedio
            </Text>
          </div>
          <div>
            <Text size="sm" weight="bold" className="tabular-nums">
              {formatCents(currentMonth.totalCents, currency, currencyFormat)}
            </Text>
            <Text
              size="xs"
              variant="muted"
              className="uppercase tracking-widest opacity-60"
            >
              Este mes ({currentMonth.count})
            </Text>
          </div>
        </div>
      </Card>
    </div>
  );
}

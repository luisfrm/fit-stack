"use client";

import * as React from "react";
import Link from "next/link";
import { Text } from "@workspace/ui/components";
import { Timer, CreditCard, Trophy, ChartColumn } from "lucide-react";
import type { IPaymentMethodConfig } from "@workspace/shared/types";
import { PLATFORM_SETTINGS_KEYS } from "@/lib/config/platform-settings";
import {
  ValueConverter,
  type CurrencyFormat,
} from "@/lib/utils/value-converters";
import {
  selectTopPlansByRevenue,
  selectExpiringSoon,
} from "@/lib/platform/subscription-selectors";
import type {
  RevenuePoint,
  SubscriptionWithDetails,
} from "@/lib/services/platform-subscriptions-service";

interface SubscriptionsSidePanelProps {
  readonly revenue: RevenuePoint[];
  readonly activeSubscriptions: SubscriptionWithDetails[];
  readonly expiringSubscriptions: SubscriptionWithDetails[];
  readonly currencyFormat?: CurrencyFormat;
  readonly currency?: string;
  readonly settings?: Record<string, string>;
}

function formatDaysLeft(daysLeft: number): string {
  if (daysLeft <= 0) return "Vence hoy";
  if (daysLeft === 1) return "Vence mañana";
  return `En ${daysLeft} días`;
}

function formatMonth(month: string): string {
  const d = new Date(`${month}T00:00:00`);
  if (Number.isNaN(d.getTime())) return month;
  const label = d.toLocaleDateString("es-ES", { month: "short" });
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
}

function PanelSection({
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
      className="rounded-2xl border border-white/5 bg-white/5 p-5"
    >
      <div className="flex items-center gap-2 mb-4">
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

export function SubscriptionsSidePanel({
  revenue,
  activeSubscriptions,
  expiringSubscriptions,
  currencyFormat = "latam",
  currency = "USD",
  settings = {},
}: SubscriptionsSidePanelProps) {
  const last6 = React.useMemo(() => revenue.slice(-6), [revenue]);
  const topPlans = React.useMemo(
    () => selectTopPlansByRevenue(activeSubscriptions).slice(0, 5),
    [activeSubscriptions],
  );
  const expiringSoon = React.useMemo(
    () => selectExpiringSoon(expiringSubscriptions, new Date()),
    [expiringSubscriptions],
  );

  const paymentMethods = React.useMemo(() => {
    const raw = settings[PLATFORM_SETTINGS_KEYS.ACTIVE_PAYMENT_METHODS];
    if (!raw) return [];
    try {
      return JSON.parse(raw) as IPaymentMethodConfig[];
    } catch {
      return [];
    }
  }, [settings]);

  return (
    <aside className="flex flex-col gap-4">
      <PanelSection
        title="Vencen pronto"
        icon={<Timer size={16} className="text-orange-400" />}
        testId="subs-panel-expiring"
      >
        <div className="flex flex-col gap-2">
          {expiringSoon.map(({ sub, daysLeft }) => (
            <Link
              key={sub.id}
              href={`/organizations/${sub.organizationSlug ?? sub.organizationId}`}
              className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 bg-white/5 hover:bg-white/10 transition-colors"
            >
              <div className="flex flex-col min-w-0">
                <Text size="sm" className="truncate">
                  {sub.organizationName || sub.organizationId}
                </Text>
                <Text
                  size="xs"
                  variant="muted"
                  className="opacity-60 uppercase tracking-widest"
                >
                  {sub.planName ?? "Sin plan"}
                </Text>
              </div>
              <Text
                size="xs"
                weight="bold"
                className="shrink-0 tabular-nums text-orange-400"
              >
                {formatDaysLeft(daysLeft)}
              </Text>
            </Link>
          ))}
          {expiringSoon.length === 0 && (
            <Text size="xs" variant="muted" className="opacity-60">
              Sin vencimientos en los próximos 7 días.
            </Text>
          )}
        </div>
        {expiringSoon.length > 0 && (
          <Link
            href="/subscriptions?status=expiring"
            className="block mt-3 text-xs font-bold uppercase tracking-widest text-primary hover:underline"
          >
            Ver todas →
          </Link>
        )}
      </PanelSection>

      <PanelSection
        title="Ingresos 6M"
        icon={<ChartColumn size={16} className="text-emerald-400" />}
        testId="subs-panel-revenue"
      >
        <div className="flex flex-col gap-2">
          {last6.map((point) => (
            <div
              key={point.month}
              className="flex items-center justify-between"
            >
              <Text
                size="xs"
                variant="muted"
                className="uppercase tracking-widest"
              >
                {formatMonth(point.month)}
              </Text>
              <Text size="sm" weight="bold" className="tabular-nums">
                {ValueConverter.format(
                  point.totalCents / 100,
                  currency,
                  currencyFormat,
                )}
              </Text>
            </div>
          ))}
          {last6.length === 0 && (
            <Text size="xs" variant="muted" className="opacity-60">
              Sin ingresos validados en el periodo.
            </Text>
          )}
        </div>
        <Text size="xs" variant="muted" className="opacity-40 italic mt-3">
          Pagos validados. Las sumas mezclan monedas (ver FUTURE_IDEAS §5).
        </Text>
      </PanelSection>

      <PanelSection
        title="Top planes"
        icon={<Trophy size={16} className="text-primary" />}
        testId="subs-panel-plans"
      >
        <div className="flex flex-col gap-2">
          {topPlans.map((plan, index) => (
            <div
              key={plan.planId}
              className="flex items-center justify-between gap-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Text
                  size="xs"
                  variant="muted"
                  className="tabular-nums opacity-60"
                >
                  {index + 1}.
                </Text>
                <Text size="sm" className="truncate uppercase tracking-tight">
                  {plan.planName}
                </Text>
              </div>
              <Text size="sm" weight="bold" className="tabular-nums shrink-0">
                {ValueConverter.format(
                  plan.revenueCents / 100,
                  currency,
                  currencyFormat,
                )}
              </Text>
            </div>
          ))}
          {topPlans.length === 0 && (
            <Text size="xs" variant="muted" className="opacity-60">
              Sin suscripciones activas.
            </Text>
          )}
        </div>
      </PanelSection>

      <PanelSection
        title="Métodos de pago"
        icon={<CreditCard size={16} className="text-blue-400" />}
        testId="subs-panel-methods"
      >
        <div className="flex flex-col gap-2">
          {paymentMethods.map((method) => (
            <div key={method.id} className="flex items-center justify-between">
              <Text size="sm">{method.name}</Text>
              <Text size="xs" variant="muted" className="opacity-60">
                {method.currency ?? "Todas"}
              </Text>
            </div>
          ))}
          {paymentMethods.length === 0 && (
            <Text size="xs" variant="muted" className="opacity-60">
              Sin métodos configurados.
            </Text>
          )}
        </div>
      </PanelSection>
    </aside>
  );
}

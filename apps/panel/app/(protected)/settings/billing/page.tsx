import { Text, Badge, Button } from "@workspace/ui/components";
import { Title } from "@workspace/ui";
import { Gift, Sparkles, Users, Zap, ShieldCheck, Info } from "lucide-react";
import { sessionService } from "@/lib/services/session-service";
import { getOrgFeatures, getOrgSeats, getAiUsage } from "@/lib/services/org-features";
import { getOrgSubscriptionStatus } from "@/lib/services/subscription-status";
import { FEATURE_CATALOG, formatFeatureLimits, summarizeFeatures, type PlanFeaturesV2 } from "@workspace/shared";
import { PortalSeatsBanner } from "@/components/dashboard/portal-seats-banner";
import { AiQuotaBanner } from "@/components/chat/ai-quota-banner";
import Link from "next/link";

export const dynamic = "force-dynamic";

function FeatureRow({ label, enabled, detail, alwaysOn }: { label: string; enabled: boolean; detail?: string | null; alwaysOn?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border-muted px-4 py-3 last:border-b-0">
      <div className="flex items-center gap-3 min-w-0">
        <ShieldCheck className={`size-3.5 shrink-0 ${enabled ? "text-primary" : "text-foreground-dim"}`} />
        <div className="flex flex-col min-w-0">
          <span className="text-[13px] font-bold tracking-wide text-foreground truncate">
            {label}
            {alwaysOn && <span className="ml-2 rounded-full bg-primary/10 border border-primary/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-primary align-middle">Always on</span>}
          </span>
          {detail && <span className="text-xs text-foreground-muted truncate">{detail}</span>}
        </div>
      </div>
      <Badge variant={enabled ? "success" : "outline"} size="sm" className="uppercase tracking-widest shrink-0 text-[10px]">
        {enabled ? "Activo" : "Off"}
      </Badge>
    </div>
  );
}

export default async function BillingSettingsPage() {
  const { data: session } = await sessionService.getSession();
  const activeOrgId = session?.session?.activeOrganizationId || null;

  const [featuresData, seats, usage, subscriptionStatus] = await Promise.all([
    getOrgFeatures(activeOrgId, { next: { revalidate: 60, tags: [`org:${activeOrgId}:features`] } }),
    getOrgSeats({ next: { revalidate: 60, tags: [`org:${activeOrgId}:members`] } }),
    getAiUsage({ next: { revalidate: 60 } }),
    getOrgSubscriptionStatus(activeOrgId),
  ]);

  const features = (featuresData?.features ?? {}) as PlanFeaturesV2;
  const isFreeTier = featuresData?.isFreeTier ?? false;
  const effectiveStatus = featuresData?.subscriptionStatus ?? subscriptionStatus ?? "unknown";
  const planName = featuresData?.planName ?? (isFreeTier ? "Plan Gratuito" : "Sin plan");
  const planId = featuresData?.planId;

  const statusBadge = () => {
    if (isFreeTier) return <Badge variant="info" size="md" className="uppercase tracking-widest">Free Tier</Badge>;
    if (effectiveStatus === "active" || effectiveStatus === "trial") return <Badge variant="success" size="md" className="uppercase tracking-widest">{effectiveStatus}</Badge>;
    if (effectiveStatus === "past_due") return <Badge variant="warning" size="md" className="uppercase tracking-widest">Past Due</Badge>;
    if (effectiveStatus === "read_only") return <Badge variant="warning" size="md" className="uppercase tracking-widest">Solo lectura</Badge>;
    return <Badge variant="destructive" size="md" className="uppercase tracking-widest">{String(effectiveStatus)}</Badge>;
  };

  return (
    <div className="pb-20 max-w-4xl animate-in fade-in slide-in-from-bottom-2 duration-500">
      {/* Header — editorial, sin card */}
      <div className="flex flex-col gap-4 border-b border-border-muted pb-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5 min-w-0">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Gift className="size-3.5" />
              </span>
              <Title as="h1" size="card" className="tracking-tight text-[22px] font-bold">
                Facturación & Plan
              </Title>
            </div>
            <Text variant="muted" className="max-w-[56ch] text-[13px] leading-relaxed">
              Suscripción SaaS efectiva y módulos habilitados. {isFreeTier ? "Operas en el piso gratuito de la plataforma." : summarizeFeatures(features)}
            </Text>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {statusBadge()}
            <Link href="/members">
              <Button variant="outlined" size="sm">Ver uso</Button>
            </Link>
          </div>
        </div>
        {isFreeTier ? (
          <div className="flex gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3.5 py-3">
            <Info className="size-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs leading-relaxed text-foreground/80">
              Plan Gratuito activo — sin suscripción pagada. Para desbloquear CMS, más cupos o Chat IA, contacta al equipo Fit-Stack.
            </p>
          </div>
        ) : null}
      </div>

      {/* Plan — sección con lista plana, sin card-en-card */}
      <section className="mt-8 overflow-hidden rounded-xl border border-border bg-surface">
        <div className="flex items-center justify-between gap-3 border-b border-border-muted bg-surface-2/40 px-4 py-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <Sparkles className="size-4 text-primary shrink-0" />
            <span className="text-sm font-bold tracking-tight truncate">{planName}</span>
            <span className="hidden sm:inline text-[11px] text-foreground-muted truncate">· {planId ? `ID ${planId}` : "Piso gratuito"} · {String(effectiveStatus)}</span>
          </div>
          {!isFreeTier && (
            <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-foreground-muted">
              <ShieldCheck className="size-3.5 text-success" /> {Object.values(features).filter((v: unknown) => (v as { enabled?: boolean })?.enabled).length} módulos activos
            </span>
          )}
        </div>
        <div className="divide-y divide-border-muted">
          {(Object.entries(FEATURE_CATALOG) as [keyof PlanFeaturesV2, typeof FEATURE_CATALOG[keyof typeof FEATURE_CATALOG]][]).map(([id, def]) => {
            const value = features[id];
            const enabled = value?.enabled ?? (def as { defaultEnabled: boolean }).defaultEnabled ?? false;
            const limits = formatFeatureLimits(value);
            return (
              <FeatureRow
                key={String(id)}
                label={def.label}
                enabled={enabled}
                detail={enabled ? limits : null}
                alwaysOn={(def as { alwaysOn?: boolean }).alwaysOn}
              />
            );
          })}
        </div>
      </section>

      {/* Cuotas — dos bloques con ritmo distinto, no dos Cards idénticas */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <section className="rounded-xl border border-border bg-surface p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex size-7 items-center justify-center rounded-lg bg-blue-500/10 border border-blue-500/20">
              <Users className="size-3.5 text-blue-500" />
            </span>
            <span className="text-sm font-bold">Portal</span>
            <span className="ml-auto text-[10px] font-bold uppercase tracking-widest text-foreground-muted border border-border-muted rounded-full px-2 py-0.5">members_portal</span>
          </div>
          {features.members_portal?.enabled ? (
            seats ? <PortalSeatsBanner used={seats.used} limit={seats.limit} pending={seats.pending} /> : <Text size="sm" variant="muted">Cargando…</Text>
          ) : (
            <p className="text-sm text-foreground-muted">Portal no contratado en este plan.</p>
          )}
        </section>

        <section className="rounded-xl border border-border bg-surface p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex size-7 items-center justify-center rounded-lg bg-violet-500/10 border border-violet-500/20">
              <Zap className="size-3.5 text-violet-500" />
            </span>
            <span className="text-sm font-bold">Chat IA</span>
            <span className="ml-auto text-[10px] font-bold uppercase tracking-widest text-foreground-muted border border-border-muted rounded-full px-2 py-0.5">ai_chat</span>
          </div>
          {features.ai_chat?.enabled ? (
            usage ? <AiQuotaBanner usage={usage} /> : <Text size="sm" variant="muted">Sin datos todavía.</Text>
          ) : (
            <p className="text-sm text-foreground-muted">Chat IA no contratado en este plan.</p>
          )}
          <p className="text-[11px] text-foreground-muted">0 = ilimitado · diaria / semanal / mensual</p>
        </section>
      </div>
    </div>
  );
}

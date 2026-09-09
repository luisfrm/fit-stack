import * as React from "react";
import Link from "next/link";
import { Text } from "@workspace/ui/components";
import { Building2, ExternalLink } from "lucide-react";
import { COUNTRIES } from "@workspace/shared/constants";
import { formatShortDate } from "@/lib/utils/value-converters";

interface OrgProfileSidePanelProps {
  readonly slug: string;
  readonly countryCode?: string | null;
  readonly timezone?: string | null;
  readonly primaryCurrency?: string | null;
  readonly createdAt?: string | Date | null;
}

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-white/5 py-2 last:border-b-0">
      <Text
        size="xs"
        variant="muted"
        className="uppercase tracking-widest font-bold opacity-60 shrink-0"
      >
        {label}
      </Text>
      <Text size="xs" className="truncate tabular-nums">
        {value}
      </Text>
    </div>
  );
}

export function OrgProfileSidePanel({
  slug,
  countryCode,
  timezone,
  primaryCurrency,
  createdAt,
}: OrgProfileSidePanelProps) {
  return (
    <aside className="flex flex-col gap-4">
      <section
        data-testid="org-profile-facts"
        className="rounded-2xl border border-white/5 bg-white/5 p-5"
      >
        <div className="flex items-center gap-2 mb-3">
          <Building2 size={16} className="text-primary" />
          <Text
            size="xs"
            variant="muted"
            className="uppercase font-black tracking-widest leading-none"
          >
            Ficha
          </Text>
        </div>
        <div className="flex flex-col">
          <FactRow label="Slug" value={slug} />
          <FactRow
            label="País"
            value={COUNTRIES[countryCode ?? ""]?.name ?? countryCode ?? "—"}
          />
          <FactRow label="Zona horaria" value={timezone ?? "—"} />
          <FactRow label="Moneda" value={primaryCurrency ?? "—"} />
          <FactRow
            label="Alta"
            value={createdAt ? formatShortDate(createdAt) : "—"}
          />
        </div>
      </section>

      <section
        data-testid="org-profile-links"
        className="rounded-2xl border border-white/5 bg-white/5 p-5"
      >
        <div className="flex items-center gap-2 mb-3">
          <ExternalLink size={16} className="text-blue-400" />
          <Text
            size="xs"
            variant="muted"
            className="uppercase font-black tracking-widest leading-none"
          >
            Accesos
          </Text>
        </div>
        <div className="flex flex-col gap-2">
          <Link
            href={`/organizations/${slug}/settings`}
            className="flex items-center justify-between rounded-lg px-3 py-2 bg-white/5 hover:bg-white/10 transition-colors"
          >
            <Text size="sm">Configuración</Text>
          </Link>
          <Link
            href={`/organizations/${slug}/settings/staff`}
            className="flex items-center justify-between rounded-lg px-3 py-2 bg-white/5 hover:bg-white/10 transition-colors"
          >
            <Text size="sm">Staff de la sede</Text>
          </Link>
        </div>
      </section>
    </aside>
  );
}

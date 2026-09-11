"use client";

import * as React from "react";
import { BellRing, Eye, EyeOff } from "lucide-react";
import { Card } from "@workspace/ui/components/card";
import { Text } from "@workspace/ui/components/text";
import { localTimeString } from "@workspace/shared/date";
import {
  formatCountdown,
  nextClassToday,
} from "@/lib/classes/class-summary-selectors";
import type { WeekOccurrence } from "@/lib/classes/week-calendar";

interface ClassesSummaryStripProps {
  readonly todayOccurrences: WeekOccurrence[];
  readonly visible: number;
  readonly hidden: number;
  readonly timezone: string | null | undefined;
}

/**
 * Tira resumen: próxima clase de hoy (countdown) + visibles/ocultas.
 * Sin backend: todo deriva de lo ya traído por el RSC.
 */
export function ClassesSummaryStrip({
  todayOccurrences,
  visible,
  hidden,
  timezone,
}: Readonly<ClassesSummaryStripProps>) {
  const [now, setNow] = React.useState(() => new Date());

  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const next = React.useMemo(
    () => nextClassToday(todayOccurrences, localTimeString(timezone, now)),
    [todayOccurrences, timezone, now],
  );

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card data-testid="classes-next-class" className="flex items-center gap-3 p-4">
        <BellRing className="w-5 h-5 text-primary shrink-0" />
        <div className="min-w-0">
          <Text as="p" size="xs" variant="muted" className="uppercase tracking-widest">
            Próxima clase
          </Text>
          {next ? (
            <Text as="p" size="sm" weight="bold" className="truncate">
              {next.occurrence.name} · {next.occurrence.startTime} ·{" "}
              {formatCountdown(next.minutesLeft)}
            </Text>
          ) : (
            <Text as="p" size="sm" weight="bold">
              Sin más clases hoy
            </Text>
          )}
        </div>
      </Card>
      <Card data-testid="classes-visibility-summary" className="flex items-center gap-4 p-4">
        <span className="flex items-center gap-1.5 text-sm text-slate-200 font-medium">
          <Eye className="w-4 h-4 text-emerald-500" /> {visible} visibles
        </span>
        <span className="flex items-center gap-1.5 text-sm text-slate-400 font-medium">
          <EyeOff className="w-4 h-4 text-slate-500" /> {hidden} ocultas
        </span>
      </Card>
    </div>
  );
}

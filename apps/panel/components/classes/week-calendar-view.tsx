"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button, Text } from "@workspace/ui/components";
import { useRouter } from "next/navigation";
import { cn } from "@workspace/ui/lib/utils";
import type { WeekCalendarDay } from "@/lib/classes/week-calendar";

const DAY_NAMES = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"] as const;

interface WeekCalendarViewProps {
  readonly days: WeekCalendarDay[];
  readonly weekLabel: string;
  readonly prevWeekUrl: string;
  readonly nextWeekUrl: string;
  readonly todayUrl: string;
}

/**
 * Calendario semanal (dom–sáb) de clases. Solo presentación: los días ya
 * vienen expandidos del RSC (`expandWeek`), aquí solo se navega por URL.
 */
export function WeekCalendarView({
  days,
  weekLabel,
  prevWeekUrl,
  nextWeekUrl,
  todayUrl,
}: Readonly<WeekCalendarViewProps>) {
  const router = useRouter();

  return (
    <section data-testid="classes-week-calendar" className="animate-in fade-in slide-in-from-bottom-3 duration-500">
      <div className="flex items-center justify-between mb-4">
        <Text size="sm" weight="bold" className="uppercase tracking-widest">
          Calendario semanal
        </Text>
        <div className="flex items-center gap-2">
          <Button
            variant="glass"
            size="sm"
            leftIcon={<ChevronLeft className="w-4 h-4" />}
            onClick={() => router.push(prevWeekUrl)}
            data-testid="classes-week-prev"
            aria-label="Semana anterior"
          >
            <span className="sr-only">Semana anterior</span>
          </Button>
          <button
            type="button"
            data-testid="classes-week-label"
            onClick={() => router.push(todayUrl)}
            className="text-sm text-slate-200 font-medium min-w-36 text-center hover:text-primary transition-colors cursor-pointer"
            title="Volver a hoy"
          >
            {weekLabel}
          </button>
          <Button
            variant="glass"
            size="sm"
            leftIcon={<ChevronRight className="w-4 h-4" />}
            onClick={() => router.push(nextWeekUrl)}
            data-testid="classes-week-next"
            aria-label="Semana siguiente"
          >
            <span className="sr-only">Semana siguiente</span>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {days.map((day) => (
          <div
            key={day.date}
            className={cn(
              "week-day-cell rounded-lg border p-2 min-h-24",
              day.isToday
                ? "border-primary/50 bg-primary/5"
                : "border-white/10 bg-white/5",
            )}
          >
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-[11px] uppercase tracking-wider text-slate-500">
                {DAY_NAMES[day.dayOfWeek]}
              </span>
              <span
                className={cn(
                  "text-xs font-bold",
                  day.isToday ? "text-primary" : "text-slate-200",
                )}
              >
                {day.date.slice(8, 10)}
              </span>
            </div>
            {day.occurrences.length === 0 ? (
              <p className="text-[11px] text-slate-600">—</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {day.occurrences.map((occ, idx) => (
                  <li
                    key={`${occ.classId ?? occ.name}-${idx}`}
                    title={`${occ.name} ${occ.startTime}${occ.trainerName ? ` · ${occ.trainerName}` : ""}`}
                    className={cn(
                      "week-occurrence rounded px-1.5 py-0.5 text-[11px] leading-tight truncate border",
                      occ.isElapsed
                        ? "opacity-40 border-white/5 bg-white/5 text-slate-500"
                        : "border-primary/20 bg-primary/10 text-slate-200",
                    )}
                  >
                    {occ.startTime} {occ.name}
                    {!occ.isVisible && " · oculta"}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

import type { IGymClass } from "@workspace/shared/types";
import type { WeekOccurrence } from "./week-calendar";

/** Resumen visibles/ocultas del catálogo (sin backend, sobre lo ya traído). */
export function countVisibility(classes: IGymClass[]): { visible: number; hidden: number } {
  let visible = 0;
  for (const cls of classes) {
    if (cls.isVisible) visible++;
  }
  return { visible, hidden: classes.length - visible };
}

export interface NextClass {
  readonly occurrence: WeekOccurrence;
  /** Minutos hasta el inicio (<= 0 = ya empezó / ahora). */
  readonly minutesLeft: number;
}

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * Próxima clase de hoy: primera ocurrencia no transcurrida ordenada por
 * `startTime`. `nowTime` es 'HH:MM' local (inyectado para testear).
 */
export function nextClassToday(
  occurrences: WeekOccurrence[],
  nowTime: string,
): NextClass | null {
  const upcoming = occurrences
    .filter((o) => !o.isElapsed)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  const occurrence = upcoming[0];
  if (!occurrence) return null;
  return { occurrence, minutesLeft: toMinutes(occurrence.startTime) - toMinutes(nowTime) };
}

/** 'En 2 h 15 min' | 'En 45 min' | 'Ahora mismo'. */
export function formatCountdown(minutesLeft: number): string {
  if (minutesLeft <= 0) return "Ahora mismo";
  if (minutesLeft < 60) return `En ${minutesLeft} min`;
  const hours = Math.floor(minutesLeft / 60);
  const rest = minutesLeft % 60;
  return rest === 0 ? `En ${hours} h` : `En ${hours} h ${rest} min`;
}

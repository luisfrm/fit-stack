import type { IGymClass } from "@workspace/shared/types";
import type { WeekOccurrence } from "./week-calendar";

/** Catalog visibility summary (client-side, over already-fetched classes). */
export function countVisibility(classes: IGymClass[]): { visible: number; hidden: number } {
  let visible = 0;
  for (const cls of classes) {
    if (cls.isVisible) visible++;
  }
  return { visible, hidden: classes.length - visible };
}

export interface NextClass {
  readonly occurrence: WeekOccurrence;
  /** Minutes until class starts (<= 0 = already started / right now). */
  readonly minutesLeft: number;
}

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * Today's next class: first upcoming occurrence sorted by
 * `startTime`. `nowTime` is local 'HH:MM' (injected for deterministic testing).
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

/** 'In 2 h 15 min' | 'In 45 min' | 'Right now'. */
export function formatCountdown(minutesLeft: number): string {
  if (minutesLeft <= 0) return "Ahora mismo";
  if (minutesLeft < 60) return `En ${minutesLeft} min`;
  const hours = Math.floor(minutesLeft / 60);
  const rest = minutesLeft % 60;
  return rest === 0 ? `En ${hours} h` : `En ${hours} h ${rest} min`;
}

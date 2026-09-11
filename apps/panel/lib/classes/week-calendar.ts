import type { IGymClass } from "@workspace/shared/types";
import {
  addLocalDays,
  localTimeString,
  localWeekday,
  parseLocalToUtc,
  toLocalDayString,
} from "@workspace/shared/date";

export interface WeekOccurrence {
  readonly classId?: number;
  readonly name: string;
  readonly trainerName?: string;
  readonly startTime: string;
  readonly endTime?: string;
  readonly isVisible: boolean;
  /** Ya transcurrió hoy (solo se evalúa en el día actual). */
  readonly isElapsed: boolean;
}

export interface WeekCalendarDay {
  /** Día local 'YYYY-MM-DD'. */
  readonly date: string;
  /** 0=dom … 6=sáb. */
  readonly dayOfWeek: number;
  readonly isToday: boolean;
  readonly count: number;
  readonly occurrences: WeekOccurrence[];
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Valida el ancla `?week=` ('YYYY-MM-DD'); si es inválido/ausente,
 * devuelve el día local actual. Pura y testeable.
 */
export function resolveWeekAnchor(
  raw: string | undefined,
  tz: string | null | undefined,
  now: Date = new Date(),
): string {
  if (raw && DATE_RE.test(raw)) {
    try {
      const parsed = parseLocalToUtc(tz, raw);
      if (toLocalDayString(tz, parsed) === raw) return raw;
    } catch {
      // cae al default
    }
  }
  return toLocalDayString(tz, now);
}

/** Domingo ('YYYY-MM-DD') de la semana que contiene al ancla. */
export function weekStartOf(
  weekAnchor: string,
  tz: string | null | undefined,
): string {
  return addLocalDays(tz, weekAnchor, -localWeekday(tz, weekAnchor));
}

/**
 * Expande reglas `weekly` por `daysOfWeek` + eventos `once` por
 * `scheduledDate` en los 7 días dom–sáb que contienen al ancla.
 * Sin enrollments: prohibido inventar ocupación (solo conteo de clases).
 */
export function expandWeek(
  classes: IGymClass[],
  weekAnchor: string,
  tz: string | null | undefined,
  now: Date = new Date(),
): WeekCalendarDay[] {
  const today = toLocalDayString(tz, now);
  const nowTime = localTimeString(tz, now);
  const sunday = weekStartOf(weekAnchor, tz);

  const days: WeekCalendarDay[] = [];
  for (let i = 0; i < 7; i++) {
    const date = addLocalDays(tz, sunday, i);
    const dayOfWeek = localWeekday(tz, date);
    const isToday = date === today;

    const occurrences: WeekOccurrence[] = [];
    for (const cls of classes) {
      const matches =
        cls.frequencyType === "weekly"
          ? (cls.daysOfWeek ?? []).includes(dayOfWeek)
          : cls.frequencyType === "once" &&
            typeof cls.scheduledDate === "string" &&
            cls.scheduledDate.slice(0, 10) === date;
      if (!matches) continue;

      const end = cls.endTime ?? cls.startTime;
      occurrences.push({
        classId: cls.id,
        name: cls.name,
        trainerName: cls.trainerName,
        startTime: cls.startTime,
        endTime: cls.endTime,
        isVisible: cls.isVisible,
        isElapsed: isToday && end <= nowTime,
      });
    }

    occurrences.sort((a, b) => a.startTime.localeCompare(b.startTime));
    days.push({ date, dayOfWeek, isToday, count: occurrences.length, occurrences });
  }
  return days;
}

import { describe, expect, it } from 'vitest';
import type { IGymClass } from '@workspace/shared/types';
import { expandWeek, resolveWeekAnchor, weekStartOf } from '../../lib/classes/week-calendar';

const TZ = 'America/Caracas';
// Miércoles 2026-09-09 15:00 Caracas = 19:00Z.
const NOW = new Date('2026-09-09T19:00:00Z');

function weekly(overrides: Partial<IGymClass> = {}): IGymClass {
  return {
    id: 1,
    name: 'Crossfit',
    isVisible: true,
    startTime: '08:00',
    endTime: '09:00',
    frequencyType: 'weekly',
    daysOfWeek: [1, 3, 5],
    ...overrides,
  };
}

function once(overrides: Partial<IGymClass> = {}): IGymClass {
  return {
    id: 2,
    name: 'Taller',
    isVisible: true,
    startTime: '18:00',
    frequencyType: 'once',
    scheduledDate: '2026-09-10',
    ...overrides,
  };
}

describe('resolveWeekAnchor', () => {
  it('accepts a valid YYYY-MM-DD', () => {
    expect(resolveWeekAnchor('2026-09-09', TZ, NOW)).toBe('2026-09-09');
  });

  it('falls back to today for garbage', () => {
    expect(resolveWeekAnchor('nope', TZ, NOW)).toBe('2026-09-09');
  });

  it('falls back to today when missing', () => {
    expect(resolveWeekAnchor(undefined, TZ, NOW)).toBe('2026-09-09');
  });

  it('rejects impossible dates', () => {
    expect(resolveWeekAnchor('2026-13-40', TZ, NOW)).toBe('2026-09-09');
  });
});

describe('weekStartOf', () => {
  it('returns the Sunday of the anchor week', () => {
    // Miércoles 2026-09-09 → domingo 2026-09-06.
    expect(weekStartOf('2026-09-09', TZ)).toBe('2026-09-06');
  });

  it('keeps Sunday anchors unchanged', () => {
    expect(weekStartOf('2026-09-06', TZ)).toBe('2026-09-06');
  });
});

describe('expandWeek', () => {
  it('expands weekly rules on matching weekdays only', () => {
    const days = expandWeek([weekly()], '2026-09-09', TZ, NOW);
    expect(days).toHaveLength(7);
    expect(days[0]?.date).toBe('2026-09-06');
    expect(days[6]?.date).toBe('2026-09-12');

    const byDate = Object.fromEntries(days.map((d) => [d.date, d]));
    // Lun(1), mié(3), vie(5).
    expect(byDate['2026-09-07']?.count).toBe(1);
    expect(byDate['2026-09-09']?.count).toBe(1);
    expect(byDate['2026-09-11']?.count).toBe(1);
    expect(byDate['2026-09-06']?.count).toBe(0);
    expect(byDate['2026-09-08']?.count).toBe(0);
  });

  it('places once events on their scheduledDate', () => {
    const days = expandWeek([once()], '2026-09-09', TZ, NOW);
    const byDate = Object.fromEntries(days.map((d) => [d.date, d]));
    expect(byDate['2026-09-10']?.count).toBe(1);
    expect(byDate['2026-09-10']?.occurrences[0]?.name).toBe('Taller');
    expect(byDate['2026-09-09']?.count).toBe(0);
  });

  it('marks today and dims only elapsed occurrences of today', () => {
    const days = expandWeek(
      [
        weekly({ id: 1, name: 'Mañana', startTime: '08:00', endTime: '09:00' }),
        weekly({ id: 3, name: 'Tarde', startTime: '18:00', endTime: '19:00' }),
      ],
      '2026-09-09',
      TZ,
      NOW,
    );
    const wednesday = days.find((d) => d.date === '2026-09-09');
    expect(wednesday?.isToday).toBe(true);
    // 15:00 local: la de las 08:00 ya pasó, la de las 18:00 no.
    expect(wednesday?.occurrences.find((o) => o.name === 'Mañana')?.isElapsed).toBe(true);
    expect(wednesday?.occurrences.find((o) => o.name === 'Tarde')?.isElapsed).toBe(false);

    const monday = days.find((d) => d.date === '2026-09-07');
    expect(monday?.isToday).toBe(false);
    expect(monday?.occurrences.every((o) => !o.isElapsed)).toBe(true);
  });

  it('sorts occurrences by startTime', () => {
    const days = expandWeek(
      [
        weekly({ id: 1, name: 'Tarde', startTime: '18:00' }),
        weekly({ id: 2, name: 'Mañana', startTime: '07:00' }),
      ],
      '2026-09-09',
      TZ,
      NOW,
    );
    const wednesday = days.find((d) => d.date === '2026-09-09');
    expect(wednesday?.occurrences.map((o) => o.name)).toEqual(['Mañana', 'Tarde']);
  });
});

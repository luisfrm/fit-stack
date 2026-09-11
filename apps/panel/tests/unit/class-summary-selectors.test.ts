import { describe, expect, it } from 'vitest';
import {
  countVisibility,
  formatCountdown,
  nextClassToday,
} from '../../lib/classes/class-summary-selectors';
import type { WeekOccurrence } from '../../lib/classes/week-calendar';

function occ(name: string, startTime: string, isElapsed: boolean): WeekOccurrence {
  return { name, startTime, isVisible: true, isElapsed };
}

describe('countVisibility', () => {
  it('splits visible and hidden classes', () => {
    expect(
      countVisibility([
        { name: 'A', isVisible: true, startTime: '08:00', frequencyType: 'weekly' },
        { name: 'B', isVisible: false, startTime: '09:00', frequencyType: 'weekly' },
        { name: 'C', isVisible: true, startTime: '10:00', frequencyType: 'weekly' },
      ]),
    ).toEqual({ visible: 2, hidden: 1 });
  });
});

describe('nextClassToday', () => {
  it('returns the first non-elapsed occurrence with minutes left', () => {
    const next = nextClassToday(
      [occ('Mañana', '08:00', true), occ('Tarde', '18:00', false), occ('Mediodía', '12:00', false)],
      '10:30',
    );
    expect(next?.occurrence.name).toBe('Mediodía');
    expect(next?.minutesLeft).toBe(90);
  });

  it('returns null when everything elapsed', () => {
    expect(nextClassToday([occ('Mañana', '08:00', true)], '10:30')).toBeNull();
  });
});

describe('formatCountdown', () => {
  it('formats minutes, hours and now', () => {
    expect(formatCountdown(45)).toBe('En 45 min');
    expect(formatCountdown(135)).toBe('En 2 h 15 min');
    expect(formatCountdown(120)).toBe('En 2 h');
    expect(formatCountdown(0)).toBe('Ahora mismo');
    expect(formatCountdown(-5)).toBe('Ahora mismo');
  });
});

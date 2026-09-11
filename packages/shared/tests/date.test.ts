import { describe, expect, it } from 'vitest';
import { addLocalDays, localTimeString, localWeekday } from '../src/date';

const TZ = 'America/Caracas';

describe('localWeekday', () => {
  it('returns 0 for a known Sunday', () => {
    // 2026-09-06 was a Sunday.
    expect(localWeekday(TZ, '2026-09-06')).toBe(0);
  });

  it('returns 6 for a known Saturday', () => {
    expect(localWeekday(TZ, '2026-09-12')).toBe(6);
  });

  it('returns 3 for a known Wednesday', () => {
    expect(localWeekday(TZ, '2026-09-09')).toBe(3);
  });
});

describe('localTimeString', () => {
  it('formats the local wall-clock time as HH:MM', () => {
    // 15:30 Caracas (UTC-4) = 19:30Z.
    expect(localTimeString(TZ, new Date('2026-09-09T19:30:00Z'))).toBe('15:30');
  });

  it('keeps late UTC night on the same local day', () => {
    // 23:30 Caracas = 03:30Z next day.
    expect(localTimeString(TZ, new Date('2026-09-10T03:30:00Z'))).toBe('23:30');
  });
});

describe('addLocalDays', () => {
  it('adds days within the same month', () => {
    expect(addLocalDays(TZ, '2026-09-06', 3)).toBe('2026-09-09');
  });

  it('crosses month boundaries', () => {
    expect(addLocalDays(TZ, '2026-09-30', 1)).toBe('2026-10-01');
  });

  it('subtracts days', () => {
    expect(addLocalDays(TZ, '2026-09-09', -3)).toBe('2026-09-06');
  });
});

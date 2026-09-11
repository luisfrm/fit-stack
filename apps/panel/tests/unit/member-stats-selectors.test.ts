import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fillGrowthGaps,
  formatBirthdayDay,
} from '../../lib/members/member-stats-selectors';

const TZ = 'America/Caracas';

describe('fillGrowthGaps', () => {
  beforeEach(() => {
    // Miércoles 2026-09-09 15:00 Caracas.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-09T19:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns six trailing months ending in the current local month', () => {
    const data = fillGrowthGaps([], TZ);
    expect(data.map((d) => d.mes)).toEqual([
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
    ]);
    expect(data.every((d) => d.Altas === 0)).toBe(true);
  });

  it('keeps backend counts and fills gaps with zero', () => {
    const data = fillGrowthGaps(
      [
        { month: '2026-09', count: 4 },
        { month: '2026-07', count: 2 },
      ],
      TZ,
    );
    expect(data).toEqual([
      { mes: '2026-04', Altas: 0 },
      { mes: '2026-05', Altas: 0 },
      { mes: '2026-06', Altas: 0 },
      { mes: '2026-07', Altas: 2 },
      { mes: '2026-08', Altas: 0 },
      { mes: '2026-09', Altas: 4 },
    ]);
  });
});

describe('formatBirthdayDay', () => {
  it('formats YYYY-MM-DD as day plus short month', () => {
    expect(formatBirthdayDay('1990-06-15')).toBe('15 jun');
    expect(formatBirthdayDay('1985-01-05')).toBe('5 ene');
  });
});

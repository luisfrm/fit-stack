import { describe, expect, it } from 'vitest';
import type { DurationUnit } from '../src/date';
import { computeSubscriptionPeriod } from '../src/subscription-period';

const TZ = 'America/Caracas';
// 11:00 local del 2026-09-09 → inicio del día local = 2026-09-09T04:00:00Z.
const NOW = new Date('2026-09-09T15:00:00Z');

interface PeriodCase {
  name: string;
  startDate: string;
  latestEndDate: string | null;
  durationValue: number;
  durationUnit: DurationUnit;
  expectedBaseline: string;
  expectedEndDate: string;
  expectedActive: boolean;
  expectedAccumulated: boolean;
}

const CASES: PeriodCase[] = [
  {
    name: 'monthly accumulation from latestEndDate',
    startDate: '2026-09-09T12:00:00Z',
    latestEndDate: '2026-09-20T04:00:00Z',
    durationValue: 1,
    durationUnit: 'month',
    expectedBaseline: '2026-09-20T04:00:00.000Z',
    expectedEndDate: '2026-10-20T04:00:00.000Z',
    expectedActive: true,
    expectedAccumulated: true,
  },
  {
    name: 'weekly accumulation from latestEndDate',
    startDate: '2026-09-01T04:00:00Z',
    latestEndDate: '2026-09-10T04:00:00Z',
    durationValue: 1,
    durationUnit: 'week',
    expectedBaseline: '2026-09-10T04:00:00.000Z',
    expectedEndDate: '2026-09-17T04:00:00.000Z',
    expectedActive: true,
    expectedAccumulated: true,
  },
  {
    name: 'daily accumulation from latestEndDate',
    startDate: '2026-09-05T04:00:00Z',
    latestEndDate: '2026-09-12T04:00:00Z',
    durationValue: 1,
    durationUnit: 'day',
    expectedBaseline: '2026-09-12T04:00:00.000Z',
    expectedEndDate: '2026-09-13T04:00:00.000Z',
    expectedActive: true,
    expectedAccumulated: true,
  },
  {
    name: 'yearly accumulation from latestEndDate',
    startDate: '2026-09-01T04:00:00Z',
    latestEndDate: '2026-09-10T04:00:00Z',
    durationValue: 1,
    durationUnit: 'year',
    expectedBaseline: '2026-09-10T04:00:00.000Z',
    expectedEndDate: '2027-09-10T04:00:00.000Z',
    expectedActive: true,
    expectedAccumulated: true,
  },
  {
    name: 'expired period → baseline = startDate',
    startDate: '2026-09-09T12:00:00Z',
    latestEndDate: '2026-09-08T04:00:00Z',
    durationValue: 1,
    durationUnit: 'month',
    expectedBaseline: '2026-09-09T12:00:00.000Z',
    expectedEndDate: '2026-10-09T12:00:00.000Z',
    expectedActive: false,
    expectedAccumulated: false,
  },
  {
    name: 'future startDate over active period → baseline = startDate',
    startDate: '2026-09-25T04:00:00Z',
    latestEndDate: '2026-09-20T04:00:00Z',
    durationValue: 1,
    durationUnit: 'month',
    expectedBaseline: '2026-09-25T04:00:00.000Z',
    expectedEndDate: '2026-10-25T04:00:00.000Z',
    expectedActive: true,
    expectedAccumulated: false,
  },
  {
    name: 'latestEndDate null → new period from startDate',
    startDate: '2026-09-09T12:00:00Z',
    latestEndDate: null,
    durationValue: 1,
    durationUnit: 'month',
    expectedBaseline: '2026-09-09T12:00:00.000Z',
    expectedEndDate: '2026-10-09T12:00:00.000Z',
    expectedActive: false,
    expectedAccumulated: false,
  },
];

describe('computeSubscriptionPeriod', () => {
  it.each(CASES)('$name', (c) => {
    const result = computeSubscriptionPeriod({
      startDate: new Date(c.startDate),
      latestEndDate: c.latestEndDate ? new Date(c.latestEndDate) : null,
      durationValue: c.durationValue,
      durationUnit: c.durationUnit,
      timezone: TZ,
      now: NOW,
    });
    expect(result.hasActivePeriod).toBe(c.expectedActive);
    expect(result.accumulated).toBe(c.expectedAccumulated);
    expect(result.baseline.toISOString()).toBe(c.expectedBaseline);
    expect(result.endDate.toISOString()).toBe(c.expectedEndDate);
    expect(result.startDate.toISOString()).toBe(new Date(c.startDate).toISOString());
  });

  it('expires today = still active at 23:xx local (vigencia a día local)', () => {
    // 23:30 local del 2026-09-09; el periodo vence hoy a medianoche local.
    const now = new Date('2026-09-10T03:30:00Z');
    const result = computeSubscriptionPeriod({
      startDate: new Date('2026-09-01T04:00:00Z'),
      latestEndDate: new Date('2026-09-09T04:00:00Z'),
      durationValue: 1,
      durationUnit: 'month',
      timezone: TZ,
      now,
    });
    expect(result.hasActivePeriod).toBe(true);
    expect(result.accumulated).toBe(true);
    expect(result.baseline.toISOString()).toBe('2026-09-09T04:00:00.000Z');
    expect(result.endDate.toISOString()).toBe('2026-10-09T04:00:00.000Z');
  });

  it('latestEndDate undefined behaves like null (new period)', () => {
    const result = computeSubscriptionPeriod({
      startDate: new Date('2026-09-09T12:00:00Z'),
      latestEndDate: undefined,
      durationValue: 1,
      durationUnit: 'week',
      timezone: TZ,
      now: NOW,
    });
    expect(result.hasActivePeriod).toBe(false);
    expect(result.accumulated).toBe(false);
    expect(result.baseline.toISOString()).toBe('2026-09-09T12:00:00.000Z');
    expect(result.endDate.toISOString()).toBe('2026-09-16T12:00:00.000Z');
  });

  it('latestEndDate === startDate (activo) → accumulated false, baseline = startDate', () => {
    const start = new Date('2026-09-09T04:00:00Z');
    const result = computeSubscriptionPeriod({
      startDate: start,
      latestEndDate: start,
      durationValue: 1,
      durationUnit: 'month',
      timezone: TZ,
      now: NOW,
    });
    // El periodo sigue vigente (vence hoy), pero su fin NO es posterior al
    // inicio: no hay día extra que acumular.
    expect(result.hasActivePeriod).toBe(true);
    expect(result.accumulated).toBe(false);
    expect(result.baseline.toISOString()).toBe(start.toISOString());
    expect(result.endDate.toISOString()).toBe('2026-10-09T04:00:00.000Z');
  });

  it('throws without timezone (no silent fallback)', () => {
    expect(() =>
      computeSubscriptionPeriod({
        startDate: new Date('2026-09-09T12:00:00Z'),
        latestEndDate: null,
        durationValue: 1,
        durationUnit: 'month',
        timezone: '',
        now: NOW,
      }),
    ).toThrow();
  });
});

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TIMEZONE,
  getTimezoneOffset,
  localDayEndUtc,
  localDayRange,
  localDayStartUtc,
  localMonthStartUtc,
  parseLocalToUtc,
  resolveOrgTimezone,
  toLocalDayString,
  toLocalMonthString,
} from './date';

describe('resolveOrgTimezone', () => {
  it('usa el default cuando la tz es null/undefined/vacía', () => {
    expect(resolveOrgTimezone(undefined)).toBe(DEFAULT_TIMEZONE);
    expect(resolveOrgTimezone(null)).toBe(DEFAULT_TIMEZONE);
    expect(resolveOrgTimezone('')).toBe(DEFAULT_TIMEZONE);
    expect(resolveOrgTimezone('   ')).toBe(DEFAULT_TIMEZONE);
  });

  it('respeta la tz pasada', () => {
    expect(resolveOrgTimezone('Asia/Kolkata')).toBe('Asia/Kolkata');
  });
});

describe('parseLocalToUtc (regla de negocio: pago a las 11pm en Venezuela)', () => {
  it('mediodía local de Caracas es 04:00 UTC (UTC-4)', () => {
    // 2026-01-01 00:00 local Caracas = 2026-01-01 04:00 UTC
    const utc = parseLocalToUtc('America/Caracas', '2026-01-01');
    expect(utc.toISOString()).toBe('2026-01-01T04:00:00.000Z');
  });

  it('un pago a las 23:30 del 1ro en Caracas cae en el día local 2026-01-01', () => {
    // Instante UTC del pago (23:30 local Caracas = 03:30 UTC del día siguiente)
    const paymentUtc = new Date('2026-01-02T03:30:00.000Z');
    const localDay = toLocalDayString('America/Caracas', paymentUtc);
    // Debe seguir siendo el día local 01, NO el 02.
    expect(localDay).toBe('2026-01-01');
  });

  it('respeta zonas con offset de media hora (Asia/Kolkata +05:30)', () => {
    // 2026-01-01 00:00 local Kolkata = 2026-01-01T18:30:00Z (day previous)
    const utc = parseLocalToUtc('Asia/Kolkata', '2026-01-01');
    expect(utc.toISOString()).toBe('2025-12-31T18:30:00.000Z');
  });
});

describe('localDayStartUtc / localDayEndUtc', () => {
  it('devuelve el rango UTC del día local en Caracas (UTC-4)', () => {
    const { start, end } = localDayRange('America/Caracas', '2026-01-01');
    expect(start.toISOString()).toBe('2026-01-01T04:00:00.000Z');
    expect(end.toISOString()).toBe('2026-01-02T03:59:59.999Z');
  });

  it('el fin del día es 1ms antes del inicio del día siguiente', () => {
    const start = localDayStartUtc('America/Caracas', '2026-01-01');
    const end = localDayEndUtc('America/Caracas', '2026-01-01');
    const nextStart = localDayStartUtc('America/Caracas', '2026-01-02');
    expect(end.getTime()).toBe(nextStart.getTime() - 1);
    expect(end.getTime()).toBeGreaterThan(start.getTime());
  });

  it('maneja cambio de mes al pedir el inicio del día siguiente (31→1)', () => {
    const start1 = localDayStartUtc('America/Caracas', '2026-01-31');
    const startNext = localDayStartUtc('America/Caracas', '2026-02-01');
    const end31 = localDayEndUtc('America/Caracas', '2026-01-31');
    expect(start1.toISOString()).toBe('2026-01-31T04:00:00.000Z');
    expect(startNext.toISOString()).toBe('2026-02-01T04:00:00.000Z');
    expect(end31.getTime()).toBe(startNext.getTime() - 1);
  });
});

describe('toLocalDayString / toLocalMonthString', () => {
  it('formatea 2026-01-01 como día/mes local en Caracas', () => {
    const d = new Date('2026-01-01T04:00:00.000Z'); // medianoche en Caracas
    expect(toLocalDayString('America/Caracas', d)).toBe('2026-01-01');
    expect(toLocalMonthString('America/Caracas', d)).toBe('2026-01');
  });

  it('el día local NO cambia por el offset UTC de la tarde noche', () => {
    // 23:30 local Caracas (03:30 UTC del día siguiente) sigue siendo el día 01
    const late = new Date('2026-01-02T03:30:00.000Z');
    expect(toLocalDayString('America/Caracas', late)).toBe('2026-01-01');
  });
});

describe('getTimezoneOffset', () => {
  it('Caracas es siempre -04:00', () => {
    expect(getTimezoneOffset('America/Caracas', new Date('2026-01-01T00:00:00Z'))).toBe('-04:00');
  });

  it('Kolkata es +05:30', () => {
    expect(getTimezoneOffset('Asia/Kolkata', new Date('2026-01-01T00:00:00Z'))).toBe('+05:30');
  });

  it('UTC es +00:00', () => {
    expect(getTimezoneOffset('UTC', new Date('2026-01-01T00:00:00Z'))).toBe('+00:00');
  });
});

describe('localMonthStartUtc', () => {
  it('devuelve el inicio del mes local actual', () => {
    // Usamos una tz fija; verificamos que sea día 1 del mes a medianoche local.
    const start = localMonthStartUtc('America/Caracas', 0);
    expect(start.getUTCHours()).toBe(4); // 00:00 local Caracas = 04:00 UTC
    expect(start.getUTCDate()).toBe(1);
  });

  it('retrocede correctamente N meses', () => {
    const twoMonthsAgo = localMonthStartUtc('America/Caracas', 2);
    const nowLocal = toLocalDayString('America/Caracas', new Date());
    const monthNow = Number(nowLocal.slice(5, 7));
    const expectedMonth = monthNow === 1 || monthNow === 2 ? monthNow + 10 : monthNow - 2;
    expect(twoMonthsAgo.getUTCMonth() + 1).toBe(expectedMonth);
    expect(twoMonthsAgo.getUTCDate()).toBe(1);
  });
});

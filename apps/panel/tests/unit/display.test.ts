import { describe, expect, it } from 'vitest';
import { formatTime, formatTimeRange, getTimezoneOffset } from '../../lib/config/display';

describe('formatTime', () => {
  describe('12h format (default)', () => {
    it('formats morning time', () => {
      expect(formatTime('08:30')).toBe('8:30 AM');
    });

    it('formats noon', () => {
      expect(formatTime('12:00')).toBe('12:00 PM');
    });

    it('formats afternoon time', () => {
      expect(formatTime('14:15')).toBe('2:15 PM');
    });

    it('formats midnight (12h shows 12 AM)', () => {
      expect(formatTime('00:00')).toBe('12:00 AM');
    });

    it('formats 11 PM', () => {
      expect(formatTime('23:59')).toBe('11:59 PM');
    });

    it('formats single-digit hour without leading zero in 12h', () => {
      expect(formatTime('09:05')).toBe('9:05 AM');
    });
  });

  describe('24h format', () => {
    it('formats morning time with leading zero', () => {
      expect(formatTime('08:30', '24h')).toBe('08:30');
    });

    it('formats afternoon time', () => {
      expect(formatTime('14:15', '24h')).toBe('14:15');
    });

    it('formats midnight', () => {
      expect(formatTime('00:00', '24h')).toBe('00:00');
    });
  });
});

describe('formatTimeRange', () => {
  it('formats a full range in 12h', () => {
    expect(formatTimeRange('08:30', '09:30')).toBe('8:30 AM – 9:30 AM');
  });

  it('formats a range crossing AM/PM', () => {
    expect(formatTimeRange('11:00', '13:00')).toBe('11:00 AM – 1:00 PM');
  });

  it('formats only start when endTime is null', () => {
    expect(formatTimeRange('10:00', null)).toBe('10:00 AM');
  });

  it('formats only start when endTime is undefined', () => {
    expect(formatTimeRange('10:00')).toBe('10:00 AM');
  });

  it('formats in 24h', () => {
    expect(formatTimeRange('08:30', '09:30', '24h')).toBe('08:30 – 09:30');
  });
});

describe('getTimezoneOffset', () => {
  it('returns -04:00 for America/Caracas', () => {
    // Caracas is always UTC-4 (no DST)
    expect(getTimezoneOffset('America/Caracas')).toBe('-04:00');
  });

  it('returns +00:00 for UTC', () => {
    expect(getTimezoneOffset('UTC')).toBe('+00:00');
  });

  it('returns a valid offset string with colon for Asia/Tokyo', () => {
    const offset = getTimezoneOffset('Asia/Tokyo');
    expect(offset).toMatch(/^[+-]\d{2}:\d{2}$/);
  });
});

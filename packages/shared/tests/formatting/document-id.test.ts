/**
 * Country-driven identification values (`"<type>-<number>"` convention).
 *
 * The prefixes and labels come from `COUNTRIES` (SSOT): a natural person uses
 * `docLabel` (`C.I.`, `C.C.`) and an organization uses `taxLabel` (`R.I.F.`,
 * `NIT`). Legacy rows written before the convention keep working untouched.
 */
import { describe, expect, it } from 'vitest';
import { COUNTRIES } from '../../src/constants';
import {
  defaultTaxDocumentType,
  formatDocumentId,
  getCountryIdentity,
  isDocumentIdAllowedForCountry,
  parseDocumentId,
} from '../../src/formatting/document-id';

const VE_TYPES = COUNTRIES.VE!.docType;
const CO_TYPES = COUNTRIES.CO!.docType;

describe('parseDocumentId', () => {
  it('splits a known country prefix from the number', () => {
    expect(parseDocumentId('V-12345678', VE_TYPES)).toEqual({
      type: 'V',
      number: '12345678',
    });
    expect(parseDocumentId('C.C.-12345678', CO_TYPES)).toEqual({
      type: 'C.C.',
      number: '12345678',
    });
  });

  it('keeps hyphens that belong to the number (VE R.I.F. shape)', () => {
    expect(parseDocumentId('J-12345678-9', VE_TYPES)).toEqual({
      type: 'J',
      number: '12345678-9',
    });
  });

  it('treats a legacy value without separator as the number (no fabricated prefix)', () => {
    expect(parseDocumentId('12345678', VE_TYPES)).toEqual({
      type: '',
      number: '12345678',
    });
    expect(parseDocumentId('12345678')).toEqual({ type: '', number: '12345678' });
  });

  it('does not strip a prefix the country does not define', () => {
    expect(parseDocumentId('12-3456789', VE_TYPES)).toEqual({
      type: '',
      number: '12-3456789',
    });
    expect(parseDocumentId('TAX-9001', VE_TYPES)).toEqual({
      type: '',
      number: 'TAX-9001',
    });
  });

  it('never splits when the country is unknown (no prefix universe)', () => {
    expect(parseDocumentId('J-12345678-9', [])).toEqual({
      type: '',
      number: 'J-12345678-9',
    });
  });

  it('handles empty and incomplete values', () => {
    expect(parseDocumentId(null)).toEqual({ type: '', number: '' });
    expect(parseDocumentId('   ')).toEqual({ type: '', number: '' });
    expect(parseDocumentId('V-', VE_TYPES)).toEqual({ type: '', number: 'V-' });
    expect(parseDocumentId('-1234', VE_TYPES)).toEqual({ type: '', number: '-1234' });
  });

  it('trims surrounding whitespace', () => {
    expect(parseDocumentId('  V-12345678 ', VE_TYPES)).toEqual({
      type: 'V',
      number: '12345678',
    });
  });
});

describe('formatDocumentId', () => {
  it('composes the persisted form', () => {
    expect(formatDocumentId('V', '12345678')).toBe('V-12345678');
    expect(formatDocumentId('J', '12345678-9')).toBe('J-12345678-9');
  });

  it('returns the plain number when there is no prefix', () => {
    expect(formatDocumentId('', '12345678')).toBe('12345678');
    expect(formatDocumentId(null, '12345678')).toBe('12345678');
  });

  it('returns an empty value (nullable column) instead of a dangling prefix', () => {
    expect(formatDocumentId('V', '')).toBe('');
    expect(formatDocumentId('V', null)).toBe('');
    expect(formatDocumentId('V', '   ')).toBe('');
  });

  it('round-trips every parsed value', () => {
    for (const raw of ['V-12345678', 'J-12345678-9', 'C.C.-12345678', '12345678']) {
      const parsed = parseDocumentId(raw, [...VE_TYPES, ...CO_TYPES]);
      expect(formatDocumentId(parsed.type || 'V', parsed.number)).toBe(
        raw === '12345678' ? `V-${raw}` : raw,
      );
    }
  });
});

describe('getCountryIdentity', () => {
  it('returns the country labels and prefixes', () => {
    expect(getCountryIdentity('VE')).toEqual({
      docLabel: 'C.I.',
      taxLabel: 'R.I.F.',
      docTypes: VE_TYPES,
    });
    expect(getCountryIdentity('CO')).toEqual({
      docLabel: 'C.C.',
      taxLabel: 'NIT',
      docTypes: CO_TYPES,
    });
  });

  it('returns undefined for an unknown or absent country (no fallback)', () => {
    expect(getCountryIdentity('XX')).toBeUndefined();
    expect(getCountryIdentity('')).toBeUndefined();
    expect(getCountryIdentity(null)).toBeUndefined();
    expect(getCountryIdentity(undefined)).toBeUndefined();
  });
});

describe('defaultTaxDocumentType', () => {
  it('prefers the tax label when the country also defines it as a prefix', () => {
    expect(defaultTaxDocumentType('CO')).toBe('NIT');
  });

  it('falls back to the first defined prefix when the tax label is not a prefix', () => {
    expect(defaultTaxDocumentType('VE')).toBe('V');
  });

  it('is empty for an unknown country', () => {
    expect(defaultTaxDocumentType('XX')).toBe('');
    expect(defaultTaxDocumentType(null)).toBe('');
  });
});

describe('isDocumentIdAllowedForCountry (RD-148 write guard)', () => {
  it('accepts every prefix of the organization country', () => {
    for (const type of VE_TYPES) {
      expect(isDocumentIdAllowedForCountry(`${type}-12345678`, 'VE')).toBe(true);
    }
    for (const type of CO_TYPES) {
      expect(isDocumentIdAllowedForCountry(`${type}-12345678`, 'CO')).toBe(true);
    }
  });

  it('rejects a prefix defined by ANOTHER country (wrong-country document type)', () => {
    expect(isDocumentIdAllowedForCountry('C.C.-12345678', 'VE')).toBe(false);
    expect(isDocumentIdAllowedForCountry('NIT-9001', 'VE')).toBe(false);
    expect(isDocumentIdAllowedForCountry('T.I.-123', 'VE')).toBe(false);
    expect(isDocumentIdAllowedForCountry('V-12345678', 'CO')).toBe(false);
    expect(isDocumentIdAllowedForCountry('E-12345678', 'CO')).toBe(false);
  });

  it('allows an empty/absent value (nullable column)', () => {
    expect(isDocumentIdAllowedForCountry(null, 'VE')).toBe(true);
    expect(isDocumentIdAllowedForCountry(undefined, 'VE')).toBe(true);
    expect(isDocumentIdAllowedForCountry('   ', 'VE')).toBe(true);
  });

  it('allows a legacy value without a prefix token', () => {
    expect(isDocumentIdAllowedForCountry('12345678', 'VE')).toBe(true);
    expect(isDocumentIdAllowedForCountry('-1234', 'VE')).toBe(true);
  });

  it('tolerates an unknown token: it is a legacy hyphen-inside-number value', () => {
    expect(isDocumentIdAllowedForCountry('12-3456789', 'VE')).toBe(true);
    expect(isDocumentIdAllowedForCountry('TAX-9001', 'VE')).toBe(true);
  });

  it('allows a hyphen that belongs to the number of a valid type', () => {
    expect(isDocumentIdAllowedForCountry('J-12345678-9', 'VE')).toBe(true);
  });

  it('rejects a dangling prefix with no number (never composed by the UI)', () => {
    expect(isDocumentIdAllowedForCountry('V-', 'VE')).toBe(false);
    expect(isDocumentIdAllowedForCountry('NIT-', 'CO')).toBe(false);
  });

  it('allows anything when the country has no catalog (nothing to enforce)', () => {
    expect(isDocumentIdAllowedForCountry('NIT-9001', 'XX')).toBe(true);
    expect(isDocumentIdAllowedForCountry('NIT-9001', null)).toBe(true);
    expect(isDocumentIdAllowedForCountry('NIT-9001', undefined)).toBe(true);
  });

  it('keeps a legacy row editable while the stored value is not changed', () => {
    // A VE org that predates the catalog holds a CO-shaped id: repeating it is
    // not a change, so the write (e.g. toggling `isActive`) is not blocked.
    expect(isDocumentIdAllowedForCountry('C.C.-12345678', 'VE', 'C.C.-12345678')).toBe(
      true,
    );
    expect(isDocumentIdAllowedForCountry('  V-1  ', 'VE', 'V-1')).toBe(true);
  });

  it('applies the rule as soon as the stored value changes', () => {
    expect(isDocumentIdAllowedForCountry('C.C.-12345678', 'VE', 'V-1')).toBe(false);
    expect(isDocumentIdAllowedForCountry('NIT-9001', 'VE', 'C.C.-12345678')).toBe(false);
    expect(isDocumentIdAllowedForCountry('C.C.-12345678', 'VE', null)).toBe(false);
  });
});

describe('COUNTRIES document prefixes', () => {
  it('VE declares the natural person and juridical prefixes', () => {
    expect(VE_TYPES).toEqual(['V', 'E', 'P', 'J', 'G']);
  });

  it('CO declares the natural person and juridical prefixes', () => {
    expect(CO_TYPES).toEqual(['C.C.', 'C.E.', 'NIT', 'T.I.', 'PPT', 'PA']);
  });

  it('every country prefix is non empty (options rendered as-is)', () => {
    for (const country of Object.values(COUNTRIES)) {
      for (const type of country.docType) {
        expect(type.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('the tax label is unique among the prefixes when the country defines it', () => {
    expect(VE_TYPES.filter((t) => t === COUNTRIES.VE!.taxLabel)).toEqual([]);
    expect(CO_TYPES.filter((t) => t === COUNTRIES.CO!.taxLabel)).toEqual(['NIT']);
  });
});

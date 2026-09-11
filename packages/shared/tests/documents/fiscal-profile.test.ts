import { describe, expect, it } from 'vitest';
import { parseRate, resolveFiscalProfile } from '../../src/index';

describe('parseRate', () => {
  it('parses percentage strings from the country catalog', () => {
    expect(parseRate('16%')).toBeCloseTo(0.16);
    expect(parseRate('3%')).toBeCloseTo(0.03);
    expect(parseRate('19%')).toBeCloseTo(0.19);
  });

  it('accepts already-decimal values and bare percentages', () => {
    expect(parseRate('0.16')).toBeCloseTo(0.16);
    expect(parseRate('16')).toBeCloseTo(0.16);
  });

  it('throws on empty or invalid rates (no silent fallback)', () => {
    expect(() => parseRate('')).toThrow();
    expect(() => parseRate('abc')).toThrow();
  });
});

describe('resolveFiscalProfile', () => {
  it('VE: exposes IVA 16% and conditional IGTF 3%, all disabled by default', () => {
    const profile = resolveFiscalProfile('VE');
    const byName = Object.fromEntries(profile.taxes.map((tax) => [tax.name, tax]));

    expect(byName.IVA?.rate).toBeCloseTo(0.16);
    expect(byName.IVA?.enabled).toBe(false);
    expect(byName.IGTF?.rate).toBeCloseTo(0.03);
    expect(byName.IGTF?.condition).toBe("payment_currency !== 'VES'");
    expect(profile.taxLabel).toBe('R.I.F.');
    expect(profile.docLabel).toBe('C.I.');
    expect(profile.requestedDocumentLabel).toBe('Comprobante de pago');
    expect(profile.disclaimer.length).toBeGreaterThan(0);
  });

  it('CO / PE expose the country defaults', () => {
    const co = resolveFiscalProfile('CO');
    expect(co.taxes.find((tax) => tax.name === 'IVA')?.rate).toBeCloseTo(0.19);

    const pe = resolveFiscalProfile('PE');
    expect(pe.taxes.find((tax) => tax.name === 'IGV')?.rate).toBeCloseTo(0.18);
  });

  it('US has no default taxes', () => {
    expect(resolveFiscalProfile('US').taxes).toEqual([]);
  });

  it('applies org overrides by name (enable, rate) and keeps country conditionals', () => {
    const profile = resolveFiscalProfile('VE', {
      isFormalTaxpayer: true,
      taxes: [
        { name: 'IVA', rate: 0.08, enabled: true },
        { name: 'IGTF', rate: 0.03, enabled: true },
      ],
    });
    const iva = profile.taxes.find((tax) => tax.name === 'IVA');
    const igtf = profile.taxes.find((tax) => tax.name === 'IGTF');

    expect(iva?.enabled).toBe(true);
    expect(iva?.rate).toBeCloseTo(0.08);
    expect(igtf?.enabled).toBe(true);
    expect(igtf?.condition).toBe("payment_currency !== 'VES'");
    expect(profile.isFormalTaxpayer).toBe(true);
  });

  it('allows custom taxes not defined by the country', () => {
    const profile = resolveFiscalProfile('US', {
      taxes: [{ name: 'Sales Tax', rate: 0.07, enabled: true }],
    });
    expect(profile.taxes).toEqual([
      { name: 'Sales Tax', rate: 0.07, enabled: true },
    ]);
  });

  it('uses the country disclaimer unless the org overrides it', () => {
    const override = ['Texto legal propio del gym.'];
    expect(resolveFiscalProfile('VE', { disclaimerOverride: override }).disclaimer).toEqual(
      override,
    );
  });

  it('preserves the requested document label (the gate decides the real one)', () => {
    expect(resolveFiscalProfile('VE', { documentLabel: 'Factura' }).requestedDocumentLabel).toBe(
      'Factura',
    );
  });

  it('throws for an unsupported country', () => {
    expect(() => resolveFiscalProfile('XX')).toThrow(/País no soportado/);
  });
});

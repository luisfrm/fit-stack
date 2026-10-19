/**
 * Suggested payment methods catalog (`@workspace/shared` = single source of
 * truth, consumed by panel and console).
 *
 * Covers the resolution rule: country methods + universal ones, a country may
 * specialize a universal entry (same `id`, no duplicate) and an unknown country
 * resolves to the universals only.
 */
import { describe, expect, it } from 'vitest';
import {
  COUNTRY_SUGGESTED_PAYMENT_METHODS,
  getSuggestedPaymentMethods,
  UNIVERSAL_SUGGESTED_PAYMENT_METHODS,
} from '../src/payment-methods';

const FIELD_TYPES = ['text', 'file', 'number', 'visual'];

const ids = (countryCode?: string | null) =>
  getSuggestedPaymentMethods(countryCode).map((method) => method.id);

describe('getSuggestedPaymentMethods', () => {
  it('resolves VE as its own methods plus the universal ones', () => {
    expect(ids('VE')).toEqual([
      'pago_movil',
      'zelle',
      'binance',
      'cash',
      'transferencia',
      'card',
    ]);
  });

  it('resolves CO as its own methods plus the universal ones', () => {
    expect(ids('CO')).toEqual([
      'nequi',
      'daviplata',
      'pse',
      'bre_b',
      'card',
      'cash',
      'transferencia',
    ]);
  });

  it('specializes a universal entry instead of listing it twice (CO point of sale)', () => {
    const resolved = getSuggestedPaymentMethods('CO');
    const cards = resolved.filter((method) => method.id === 'card');
    expect(cards).toHaveLength(1);
    expect(cards[0]?.name).toBe('Datáfono / Tarjeta');
    expect(cards[0]?.currency).toBe('COP');
  });

  it('keeps the universal point of sale untouched for VE (no specialization)', () => {
    const card = getSuggestedPaymentMethods('VE').find((method) => method.id === 'card');
    expect(card?.name).toBe('Tarjeta / Punto de Venta');
    expect(card?.currency).toBeNull();
  });

  it('resolves an unknown or absent country to the universal set only', () => {
    expect(ids('XX')).toEqual(ids(undefined));
    expect(ids(null)).toEqual(['cash', 'transferencia', 'card']);
    expect(ids(undefined)).toEqual(['cash', 'transferencia', 'card']);
    expect(ids('')).toEqual(['cash', 'transferencia', 'card']);
  });

  it('never inherits another country outside its own entry', () => {
    const resolved = ids('XX');
    expect(resolved).not.toContain('pago_movil');
    expect(resolved).not.toContain('zelle');
    expect(resolved).not.toContain('nequi');
    expect(resolved).not.toContain('bre_b');
  });

  it('lists every universal method exactly once', () => {
    const universals = UNIVERSAL_SUGGESTED_PAYMENT_METHODS.map((method) => method.id);
    for (const countryCode of ['VE', 'CO', 'XX', undefined]) {
      const resolved = ids(countryCode);
      for (const universal of universals) {
        expect(resolved.filter((id) => id === universal)).toHaveLength(1);
      }
    }
  });

  it('returns a fresh array per call', () => {
    expect(getSuggestedPaymentMethods('VE')).not.toBe(getSuggestedPaymentMethods('VE'));
  });
});

describe('payment method definitions', () => {
  it('keeps the legacy VE identifiers and fields (persisted org settings)', () => {
    const resolved = getSuggestedPaymentMethods('VE');
    const pagoMovil = resolved.find((method) => method.id === 'pago_movil');
    const zelle = resolved.find((method) => method.id === 'zelle');

    expect(pagoMovil?.currency).toBe('VES');
    expect(pagoMovil?.fields.map((field) => field.id)).toEqual([
      'fld_pm1',
      'fld_pm2',
      'fld_pm3',
    ]);
    expect(zelle?.currency).toBe('USD');
  });

  it('declares each method id once inside every list', () => {
    const lists = [
      UNIVERSAL_SUGGESTED_PAYMENT_METHODS,
      ...Object.values(COUNTRY_SUGGESTED_PAYMENT_METHODS),
    ];
    for (const list of lists) {
      const listIds = list.map((method) => method.id);
      expect(new Set(listIds).size).toBe(listIds.length);
    }
  });

  it('reuses a universal id only to specialize it, never across countries', () => {
    const universalIds = UNIVERSAL_SUGGESTED_PAYMENT_METHODS.map((method) => method.id);
    const countryOnlyIds = Object.values(COUNTRY_SUGGESTED_PAYMENT_METHODS)
      .flatMap((methods) => methods.map((method) => method.id))
      .filter((id) => !universalIds.includes(id));

    expect(new Set(countryOnlyIds).size).toBe(countryOnlyIds.length);
  });

  it('defines every entry with a name, a currency rule and valid fields', () => {
    const catalog = [
      ...UNIVERSAL_SUGGESTED_PAYMENT_METHODS,
      ...Object.values(COUNTRY_SUGGESTED_PAYMENT_METHODS).flatMap((methods) => methods),
    ];

    for (const method of catalog) {
      expect(method.id.trim().length).toBeGreaterThan(0);
      expect(method.name.trim().length).toBeGreaterThan(0);
      expect(method.currency === null || /^[A-Z]{3}$/.test(method.currency)).toBe(true);

      const fieldIds = method.fields.map((field) => field.id);
      expect(new Set(fieldIds).size).toBe(fieldIds.length);
      for (const field of method.fields) {
        expect(FIELD_TYPES).toContain(field.type);
        expect(field.label.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('declares a country entry for the countries the billing flow supports', () => {
    expect(Object.keys(COUNTRY_SUGGESTED_PAYMENT_METHODS).sort()).toEqual(['CO', 'VE']);
  });
});

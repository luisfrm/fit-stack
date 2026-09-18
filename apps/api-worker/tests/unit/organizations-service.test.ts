/**
 * `mergeFiscalConfig`: merge, no reemplazo ciego.
 *
 * Unit puro (sin DB): la integración (`organizations-fiscal.test.ts`) cubre
 * el endpoint; aquí se congelan las reglas del merge.
 */
import { describe, expect, it } from 'vitest';
import { mergeFiscalConfig } from '../../src/services/organizations.service';

describe('mergeFiscalConfig', () => {
  it('null explícito resetea a defaults del país', () => {
    expect(
      mergeFiscalConfig({ isFormalTaxpayer: true, taxes: [] }, null),
    ).toBeNull();
  });

  it('PATCH parcial de taxes[] conserva escalares previos', () => {
    const merged = mergeFiscalConfig(
      {
        isFormalTaxpayer: true,
        disclaimerOverride: ['Aviso'],
        taxes: [{ name: 'IVA', rate: 0.16, enabled: true }],
      },
      { taxes: [{ name: 'IVA', rate: 0.1, enabled: true }] },
    );
    expect(merged).toMatchObject({
      isFormalTaxpayer: true,
      disclaimerOverride: ['Aviso'],
      taxes: [{ name: 'IVA', rate: 0.1, enabled: true }],
    });
  });

  it('fusiona taxes[] por nombre y conserva desconocidos', () => {
    const merged = mergeFiscalConfig(
      { taxes: [{ name: 'VIEJO', rate: 0.05, enabled: false }] },
      { taxes: [{ name: 'IVA', rate: 0.16, enabled: true }] },
    );
    expect(merged?.taxes).toEqual([
      { name: 'VIEJO', rate: 0.05, enabled: false },
      { name: 'IVA', rate: 0.16, enabled: true },
    ]);
  });

  it('base malformada no rompe el write (parte de {})', () => {
    const merged = mergeFiscalConfig('basura', {
      taxes: [{ name: 'IVA', rate: 0.16, enabled: true }],
    });
    expect(merged?.taxes).toEqual([{ name: 'IVA', rate: 0.16, enabled: true }]);
    expect(merged?.isFormalTaxpayer).toBeUndefined();
  });

  it('taxes: [] conserva la base (solo null limpia todo)', () => {
    const merged = mergeFiscalConfig(
      { taxes: [{ name: 'IVA', rate: 0.16, enabled: true }] },
      { taxes: [] },
    );
    expect(merged?.taxes).toEqual([{ name: 'IVA', rate: 0.16, enabled: true }]);
  });
});

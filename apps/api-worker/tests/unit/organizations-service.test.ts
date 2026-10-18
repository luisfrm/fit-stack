/**
 * `mergeFiscalConfig`: merge, not blind replacement.
 *
 * Pure unit (no DB): the integration (`organizations-fiscal.test.ts`) covers
 * the endpoints; here the merge rules are frozen.
 *
 * RD-145 contract: the ONLY fiscal keys are `documentLabel`,
 * `isFormalTaxpayer` (Console-only writer) and `disclaimerOverride`. Legacy
 * stored keys (`taxes`/`confirmedTaxes`) are dropped by the tolerant read and
 * never resurrected by a merge.
 */
import { describe, expect, it } from 'vitest';
import { mergeFiscalConfig } from '../../src/services/organizations.service';

describe('mergeFiscalConfig', () => {
  it('null explícito resetea a defaults del país', () => {
    expect(mergeFiscalConfig({ isFormalTaxpayer: true }, null)).toBeNull();
  });

  it('PATCH parcial del disclaimer conserva el régimen declarado', () => {
    const merged = mergeFiscalConfig(
      { isFormalTaxpayer: true, disclaimerOverride: ['Aviso'] },
      { disclaimerOverride: ['Aviso nuevo'] },
    );
    expect(merged).toEqual({
      isFormalTaxpayer: true,
      disclaimerOverride: ['Aviso nuevo'],
    });
  });

  it('escribe isFormalTaxpayer (activar y desactivar) sin tocar el resto', () => {
    expect(
      mergeFiscalConfig({ disclaimerOverride: ['Aviso'] }, { isFormalTaxpayer: true }),
    ).toEqual({ disclaimerOverride: ['Aviso'], isFormalTaxpayer: true });
    expect(
      mergeFiscalConfig({ isFormalTaxpayer: true }, { isFormalTaxpayer: false }),
    ).toEqual({ isFormalTaxpayer: false });
  });

  it('claves legadas almacenadas se descartan (no se resucitan)', () => {
    const merged = mergeFiscalConfig(
      {
        isFormalTaxpayer: true,
        taxes: [{ name: 'IVA', rate: 0.16, enabled: true }],
        confirmedTaxes: ['IGTF'],
      },
      { disclaimerOverride: ['Aviso'] },
    );
    expect(merged).toEqual({
      isFormalTaxpayer: true,
      disclaimerOverride: ['Aviso'],
    });
    expect(merged).not.toHaveProperty('taxes');
    expect(merged).not.toHaveProperty('confirmedTaxes');
  });

  it('base malformada no rompe el write (parte de {})', () => {
    expect(mergeFiscalConfig('basura', { isFormalTaxpayer: true })).toEqual({
      isFormalTaxpayer: true,
    });
    expect(mergeFiscalConfig(undefined, {})).toEqual({});
  });

  it('una clave ausente en el payload no borra el valor almacenado', () => {
    const merged = mergeFiscalConfig(
      { isFormalTaxpayer: true, disclaimerOverride: ['Aviso'] },
      {},
    );
    expect(merged).toEqual({
      isFormalTaxpayer: true,
      disclaimerOverride: ['Aviso'],
    });
  });
});

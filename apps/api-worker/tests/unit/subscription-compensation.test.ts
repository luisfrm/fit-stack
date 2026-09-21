/**
 * Unit tests for lib/subscription-compensation.ts (FS-0002)
 *
 * Pure orchestration over closures: no DB, no HTTP. The decision is by
 * RE-READ of the persisted payment, never by the error type — the branches
 * that prevent the double charge (`committed`) and the orphan (`cancel`) are
 * covered here; the integration suites cover the wiring end to end.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  COMPENSATION_VOID_REASON,
  compensateFailedEmission,
  type CompensationClosures,
} from '../../src/lib/subscription-compensation';

const EMISSION_ERROR = new Error('emission failed');

function closures(overrides: Partial<CompensationClosures> = {}): CompensationClosures {
  return {
    readPayment: vi.fn().mockResolvedValue({ receiptNumber: null }),
    voidPayment: vi.fn().mockResolvedValue(undefined),
    cancelParent: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('compensateFailedEmission', () => {
  it('re-read con número persistido → committed (no compensa, no anula)', async () => {
    const c = closures({ readPayment: vi.fn().mockResolvedValue({ receiptNumber: 'org-2026-7' }) });

    const outcome = await compensateFailedEmission(EMISSION_ERROR, c, { paymentCreated: true });

    expect(outcome).toBe('committed');
    expect(c.voidPayment).not.toHaveBeenCalled();
    expect(c.cancelParent).not.toHaveBeenCalled();
  });

  it('pago sin número → anula y compensa (nunca cancela el padre)', async () => {
    const c = closures();

    const outcome = await compensateFailedEmission(EMISSION_ERROR, c, { paymentCreated: true });

    expect(outcome).toBe('compensated');
    expect(c.voidPayment).toHaveBeenCalledTimes(1);
    expect(c.cancelParent).not.toHaveBeenCalled();
  });

  it('pago inexistente (readPayment null) → anula igualmente', async () => {
    const c = closures({ readPayment: vi.fn().mockResolvedValue(null) });

    const outcome = await compensateFailedEmission(EMISSION_ERROR, c, { paymentCreated: true });

    expect(outcome).toBe('compensated');
    expect(c.voidPayment).toHaveBeenCalledTimes(1);
  });

  it('falló el alta del pago → cancela la huérfana y compensa', async () => {
    const c = closures();

    const outcome = await compensateFailedEmission(EMISSION_ERROR, c, { paymentCreated: false });

    expect(outcome).toBe('compensated');
    expect(c.cancelParent).toHaveBeenCalledTimes(1);
    expect(c.voidPayment).not.toHaveBeenCalled();
  });

  it('sin cancelParent y sin pago creado → compensa sin reventar', async () => {
    const c = closures();
    delete c.cancelParent;

    const outcome = await compensateFailedEmission(EMISSION_ERROR, c, { paymentCreated: false });

    expect(outcome).toBe('compensated');
  });

  it('si la anulación falla, NO enmascara el error original (log + compensated)', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const c = closures({ voidPayment: vi.fn().mockRejectedValue(new Error('void boom')) });

    const outcome = await compensateFailedEmission(EMISSION_ERROR, c, { paymentCreated: true });

    expect(outcome).toBe('compensated');
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('con revertEffect → revierte el efecto solo cuando compensa', async () => {
    const revertEffect = vi.fn().mockResolvedValue(undefined);
    const c = closures({ revertEffect });

    const outcome = await compensateFailedEmission(EMISSION_ERROR, c, { paymentCreated: true });

    expect(outcome).toBe('compensated');
    expect(revertEffect).toHaveBeenCalledTimes(1);
  });

  it('committed NO revierte el efecto (el comprobante ya salió)', async () => {
    const revertEffect = vi.fn().mockResolvedValue(undefined);
    const c = closures({
      readPayment: vi.fn().mockResolvedValue({ receiptNumber: 'FS-0000001' }),
      revertEffect,
    });

    const outcome = await compensateFailedEmission(EMISSION_ERROR, c, { paymentCreated: true });

    expect(outcome).toBe('committed');
    expect(revertEffect).not.toHaveBeenCalled();
  });

  it('si la reversión falla, tampoco enmascara el error original', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const c = closures({ revertEffect: vi.fn().mockRejectedValue(new Error('revert boom')) });

    const outcome = await compensateFailedEmission(EMISSION_ERROR, c, { paymentCreated: true });

    expect(outcome).toBe('compensated');
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('U1 — relectura que falla siempre → unresolved, sin anular ni revertir', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const revertEffect = vi.fn().mockResolvedValue(undefined);
    const c = closures({
      readPayment: vi.fn().mockRejectedValue(new Error('read boom')),
      revertEffect,
    });

    const outcome = await compensateFailedEmission(EMISSION_ERROR, c, { paymentCreated: true });

    expect(outcome).toBe('unresolved');
    expect(c.voidPayment).not.toHaveBeenCalled();
    expect(revertEffect).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('U2 — relectura falla 1 vez y luego devuelve número → committed (recupera el blip)', async () => {
    const readPayment = vi
      .fn()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValue({ receiptNumber: 'org-2026-9' });
    const c = closures({ readPayment });

    const outcome = await compensateFailedEmission(EMISSION_ERROR, c, { paymentCreated: true });

    expect(outcome).toBe('committed');
    expect(readPayment).toHaveBeenCalledTimes(2);
    expect(c.voidPayment).not.toHaveBeenCalled();
  });

  it('U3 — anulación fallida → NO revierte el periodo (cobro válido conserva su efecto)', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const revertEffect = vi.fn().mockResolvedValue(undefined);
    const c = closures({
      voidPayment: vi.fn().mockRejectedValue(new Error('void boom')),
      revertEffect,
    });

    const outcome = await compensateFailedEmission(EMISSION_ERROR, c, { paymentCreated: true });

    expect(outcome).toBe('compensated');
    expect(revertEffect).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('el motivo de compensación es el contrato fijo', () => {
    expect(COMPENSATION_VOID_REASON).toBe('Compensación: fallo al emitir el comprobante');
  });
});

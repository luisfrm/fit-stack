/**
 * Ramas de `handlePaymentReceipt` (repo + R2 + sendEmail mockeados):
 * - A numerado con PDF → adjunta los bytes de R2 tal cual.
 * - B histórico (sin número) → sin adjunto, sin error.
 * - C número sin PDF → log + ack sin enviar (defensiva).
 * - Sin email / pago inexistente (incl. pago de otra org) /
 *   R2 inconsistente → sin enviar.
 * - Scope-org: el handler pasa el organizationId del evento al repo.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getComposedMock = vi.hoisted(() => vi.fn());
const sendEmailMock = vi.hoisted(() => vi.fn());
const r2GetMock = vi.hoisted(() => vi.fn());

vi.mock('@workspace/database/factory', () => ({
  createDb: () => ({}),
}));

vi.mock('@workspace/database/repositories/receipts', () => ({
  createReceiptsRepository: () => ({
    getReceiptComposedData: getComposedMock,
  }),
}));

vi.mock('../src/handlers/email.handler', () => ({
  sendEmail: sendEmailMock,
}));

import { handlePaymentReceipt } from '../src/handlers/pdf.handler';

function composed(overrides: {
  payment?: Record<string, unknown>;
  member?: Record<string, unknown> | null;
  organization?: Record<string, unknown>;
} = {}) {
  return {
    payment: {
      id: 987654,
      amountPaid: 5000,
      currencyPaid: 'USD',
      paymentMethod: 'transferencia',
      paymentDate: new Date('2026-09-11T10:00:00.000Z'),
      planSnapshotName: 'Plan Mensual',
      receiptNumber: 'fit-stack-2026-000045',
      receiptPdfKey: 'receipts/fit-stack/2026/fit-stack-2026-000045.pdf',
      ...overrides.payment,
    },
    member: {
      firstName: 'Juan',
      lastName: 'Pérez',
      email: 'juan@example.com',
      ...overrides.member,
    },
    organization: {
      currencyFormat: 'latam',
      timezone: 'America/Caracas',
      legalName: null,
      name: 'Gym Fit Stack',
      ...overrides.organization,
    },
    subscription: null,
  };
}

function env() {
  return {
    DATABASE_URL: 'postgres://test',
    FILES_BUCKET: { get: r2GetMock } as unknown as R2Bucket,
  };
}

const pdfBytes = new Uint8Array([37, 80, 68, 70, 45]);

beforeEach(() => {
  getComposedMock.mockReset().mockResolvedValue(composed());
  sendEmailMock.mockReset();
  r2GetMock.mockReset();
});

describe('handlePaymentReceipt', () => {
  it('pasa el organizationId del evento al repo (scope-org)', async () => {
    r2GetMock.mockResolvedValue({ arrayBuffer: async () => pdfBytes.buffer as ArrayBuffer });

    await handlePaymentReceipt(env(), { paymentId: 987654, organizationId: 'org-1' });

    expect(getComposedMock).toHaveBeenCalledWith('org-1', 987654);
  });

  it('Rama A: adjunta los bytes de R2 con contentType PDF y número humano', async () => {
    r2GetMock.mockResolvedValue({ arrayBuffer: async () => pdfBytes.buffer as ArrayBuffer });

    await handlePaymentReceipt(env(), { paymentId: 987654, organizationId: 'org-1' });

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const options = sendEmailMock.mock.calls[0][1] as any;
    expect(options.to).toBe('juan@example.com');
    expect(options.subject).toBe('Comprobante fit-stack-2026-000045 — Gym Fit Stack');
    expect(options.subject).not.toContain('Operación #');
    expect(options.html).toContain('fit-stack-2026-000045');
    expect(options.html).not.toContain('987654');
    expect(options.attachments).toHaveLength(1);
    expect(options.attachments[0].filename).toBe('fit-stack-2026-000045.pdf');
    expect(options.attachments[0].contentType).toBe('application/pdf');
    // Byte-identidad: lo enviado es lo leído de R2, nunca regenerado.
    expect(options.attachments[0].content).toEqual(pdfBytes);
  });

  it('Rama B: histórico sin adjunto, sin error, con línea pre-sistema', async () => {
    getComposedMock.mockResolvedValue(
      composed({ payment: { receiptNumber: null, receiptPdfKey: null } }),
    );

    await handlePaymentReceipt(env(), { paymentId: 987654, organizationId: 'org-1' });

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const options = sendEmailMock.mock.calls[0][1] as any;
    expect(options.attachments).toBeUndefined();
    expect(options.html).toContain('anterior al sistema de comprobantes correlativos');
    expect(r2GetMock).not.toHaveBeenCalled();
  });

  it('Rama C: número sin PDF → log + ack sin enviar', async () => {
    getComposedMock.mockResolvedValue(
      composed({ payment: { receiptPdfKey: null } }),
    );

    await handlePaymentReceipt(env(), { paymentId: 987654, organizationId: 'org-1' });

    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('R2 inconsistente (key sin objeto) → sin enviar', async () => {
    r2GetMock.mockResolvedValue(null);

    await handlePaymentReceipt(env(), { paymentId: 987654, organizationId: 'org-1' });

    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('miembro sin email → log + return (emisión intacta)', async () => {
    getComposedMock.mockResolvedValue(composed({ member: { email: '' } }));

    await handlePaymentReceipt(env(), { paymentId: 987654, organizationId: 'org-1' });

    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('pago inexistente o de otra org (repo undefined) → sin enviar', async () => {
    getComposedMock.mockResolvedValue(undefined);

    await handlePaymentReceipt(env(), { paymentId: 987654, organizationId: 'org-1' });

    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('org sin timezone/formato → sin enviar (sin fallback silencioso)', async () => {
    getComposedMock.mockResolvedValue(
      composed({ organization: { timezone: null, currencyFormat: null } }),
    );

    await handlePaymentReceipt(env(), { paymentId: 987654, organizationId: 'org-1' });

    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('usa el número de DB aunque el evento venga sin receiptNumber (en vuelo)', async () => {
    r2GetMock.mockResolvedValue({ arrayBuffer: async () => pdfBytes.buffer as ArrayBuffer });

    await handlePaymentReceipt(env(), { paymentId: 987654, organizationId: 'org-1' });

    const options = sendEmailMock.mock.calls[0][1] as any;
    expect(options.subject).toContain('fit-stack-2026-000045');
  });
});

/**
 * Wiring of the "Ir al Panel" CTA in `handleOrgPaymentReceived`
 * (`email.org_payment_received`): the handler resolves PANEL_URL through
 * `resolveBaseUrl`, so a missing binding fails visibly — naming the variable
 * and the CTA context — instead of building a dead link (no silent fallback).
 *
 * The raw drizzle chain and `sendEmail` are mocked: only the URL resolution
 * wiring is under test here (URL resolution itself: `email-config.test.ts`).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const selectMock = vi.hoisted(() => vi.fn());
const sendEmailMock = vi.hoisted(() => vi.fn());

vi.mock('@workspace/database/factory', () => ({
  createDb: () => ({ select: selectMock }),
}));

vi.mock('../src/handlers/email.handler', () => ({
  sendEmail: sendEmailMock,
}));

import { handleOrgPaymentReceived, type PdfHandlerEnv } from '../src/handlers/pdf.handler';

/** Minimal thenable stand-in for a drizzle query builder (`await`-able). */
function queryBuilder(rows: unknown[]) {
  const builder = {
    from: () => builder,
    innerJoin: () => builder,
    where: () => builder,
    limit: () => Promise.resolve(rows),
    then: (resolve: (value: unknown[]) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve, reject),
  };
  return builder;
}

const paymentRow = {
  payment: {
    id: 42,
    amountPaid: 9900,
    currencyPaid: 'USD',
    paymentMethod: 'transferencia',
    paymentDate: new Date('2026-10-01T10:00:00.000Z'),
    planSnapshotName: 'Plan Pro',
    status: 'completed',
    receiptNumber: null,
    receiptPdfKey: null,
    receiptVoided: false,
  },
  org: {
    id: 'org-1',
    name: 'Gym Fit Stack',
    timezone: 'America/Caracas',
    currencyFormat: 'latam',
  },
};

function env(overrides: Partial<PdfHandlerEnv> = {}): PdfHandlerEnv {
  return {
    DATABASE_URL: 'postgres://test',
    FILES_BUCKET: { get: vi.fn() } as unknown as R2Bucket,
    ...overrides,
  };
}

const payload = {
  paymentId: 42,
  organizationId: 'org-1',
  payerEmail: 'payer@example.com',
};

beforeEach(() => {
  selectMock.mockReset();
  selectMock
    .mockReturnValueOnce(queryBuilder([paymentRow]))
    .mockReturnValueOnce(queryBuilder([{ email: 'owner@example.com' }]));
  sendEmailMock.mockReset().mockResolvedValue(undefined);
});

describe('handleOrgPaymentReceived — PANEL_URL resolution', () => {
  it('throws the named-variable error and sends nothing when PANEL_URL is missing', async () => {
    await expect(handleOrgPaymentReceived(env(), payload)).rejects.toThrow(
      'Missing required env var PANEL_URL (org payment received CTA target=panel).',
    );
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('throws when PANEL_URL is blank', async () => {
    await expect(handleOrgPaymentReceived(env({ PANEL_URL: '   ' }), payload)).rejects.toThrow(
      'Missing required env var PANEL_URL (org payment received CTA target=panel).',
    );
  });

  it('renders the CTA with the trimmed PANEL_URL when present', async () => {
    await handleOrgPaymentReceived(env({ PANEL_URL: '  https://panel.example.com  ' }), payload);

    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    const [firstEnv, message] = sendEmailMock.mock.calls[0] as [PdfHandlerEnv, { html: string }];
    expect(firstEnv.PANEL_URL).toBe('  https://panel.example.com  ');
    expect(message.html).toContain('https://panel.example.com');
    expect(message.html).not.toContain('localhost');
  });
});

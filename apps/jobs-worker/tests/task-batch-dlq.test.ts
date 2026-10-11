/**
 * `processTaskBatch` dead-letter threshold branches (handlers + repos mocked),
 * exercised through the default `queue()` export with `batch.queue` set to
 * `fit-task-events`:
 * - Transient failure below the threshold → notified mark intact, retry.
 * - Final failed delivery (`attempts = max_retries + 1`) of a receipt email
 *   → mark cleared once (org or platform repo), retry still called.
 * - Invite events on the final attempt → no repo touched.
 * - Success → ack, nothing touched.
 * - Cleanup failure (repo throws) → retry still called (never interrupted).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const clearReceiptNotifiedMock = vi.hoisted(() => vi.fn());
const clearPlatformReceiptNotifiedMock = vi.hoisted(() => vi.fn());
const handleRegistrationInviteMock = vi.hoisted(() => vi.fn());
const handleOrgInviteMock = vi.hoisted(() => vi.fn());
const handlePaymentReceiptMock = vi.hoisted(() => vi.fn());
const handleOrgPaymentReceivedMock = vi.hoisted(() => vi.fn());

vi.mock('@workspace/database/factory', () => ({
  createDb: () => ({}),
}));

vi.mock('@workspace/database/repositories/receipts', () => ({
  createReceiptsRepository: () => ({
    clearReceiptNotified: clearReceiptNotifiedMock,
  }),
}));

vi.mock('@workspace/database/repositories/platform-receipts', () => ({
  createPlatformReceiptsRepository: () => ({
    clearPlatformReceiptNotified: clearPlatformReceiptNotifiedMock,
  }),
}));

vi.mock('../src/handlers/email.handler', () => ({
  handleRegistrationInvite: handleRegistrationInviteMock,
  handleOrgInvite: handleOrgInviteMock,
}));

vi.mock('../src/handlers/pdf.handler', () => ({
  handlePaymentReceipt: handlePaymentReceiptMock,
  handleOrgPaymentReceived: handleOrgPaymentReceivedMock,
}));

import worker, { type Env, type FitTaskEvent } from '../src/index';

const ackMock = vi.fn();
const retryMock = vi.fn();

function env(): Env {
  return { DATABASE_URL: 'postgres://test' } as unknown as Env;
}

function makeBatch(event: FitTaskEvent, attempts: number) {
  const message = {
    body: event,
    attempts,
    ack: ackMock,
    retry: retryMock,
  } as unknown as Parameters<typeof worker.queue>[0]['messages'][number];
  return {
    queue: 'fit-task-events',
    messages: [message],
  } as unknown as Parameters<typeof worker.queue>[0];
}

beforeEach(() => {
  ackMock.mockReset();
  retryMock.mockReset();
  clearReceiptNotifiedMock.mockReset().mockResolvedValue(undefined);
  clearPlatformReceiptNotifiedMock.mockReset().mockResolvedValue(undefined);
  handleRegistrationInviteMock.mockReset().mockResolvedValue(undefined);
  handleOrgInviteMock.mockReset().mockResolvedValue(undefined);
  handlePaymentReceiptMock.mockReset().mockResolvedValue(undefined);
  handleOrgPaymentReceivedMock.mockReset().mockResolvedValue(undefined);
});

describe('processTaskBatch — dead-letter threshold', () => {
  it('transient failure below the threshold keeps the notified mark (no duplicate email)', async () => {
    handlePaymentReceiptMock.mockRejectedValue(new Error('smtp transient failure'));

    await worker.queue(
      makeBatch({ type: 'email.payment_receipt', paymentId: 42, organizationId: 'org-1' }, 2),
      env(),
    );

    expect(clearReceiptNotifiedMock).not.toHaveBeenCalled();
    expect(clearPlatformReceiptNotifiedMock).not.toHaveBeenCalled();
    expect(retryMock).toHaveBeenCalledTimes(1);
    expect(ackMock).not.toHaveBeenCalled();
  });

  it('final failed delivery of email.payment_receipt clears the org mark exactly once', async () => {
    handlePaymentReceiptMock.mockRejectedValue(new Error('smtp dead'));

    await worker.queue(
      makeBatch({ type: 'email.payment_receipt', paymentId: 42, organizationId: 'org-1' }, 4),
      env(),
    );

    expect(clearReceiptNotifiedMock).toHaveBeenCalledTimes(1);
    expect(clearReceiptNotifiedMock).toHaveBeenCalledWith(42, 'org-1');
    expect(clearPlatformReceiptNotifiedMock).not.toHaveBeenCalled();
    expect(retryMock).toHaveBeenCalledTimes(1);
    expect(ackMock).not.toHaveBeenCalled();
  });

  it('final failed delivery of email.org_payment_received clears the platform mark exactly once', async () => {
    handleOrgPaymentReceivedMock.mockRejectedValue(new Error('smtp dead'));

    await worker.queue(
      makeBatch(
        { type: 'email.org_payment_received', paymentId: 42, organizationId: 'org-1' },
        4,
      ),
      env(),
    );

    expect(clearPlatformReceiptNotifiedMock).toHaveBeenCalledTimes(1);
    expect(clearPlatformReceiptNotifiedMock).toHaveBeenCalledWith(42);
    expect(clearReceiptNotifiedMock).not.toHaveBeenCalled();
    expect(retryMock).toHaveBeenCalledTimes(1);
  });

  it('invite events failing on the final attempt touch no repository', async () => {
    handleRegistrationInviteMock.mockRejectedValue(new Error('resend dead'));
    handleOrgInviteMock.mockRejectedValue(new Error('resend dead'));

    await worker.queue(
      makeBatch({ type: 'email.registration_invite', email: 'a@example.com', token: 't' }, 4),
      env(),
    );
    await worker.queue(
      makeBatch(
        {
          type: 'email.org_invite',
          email: 'a@example.com',
          orgName: 'Gym',
          inviterName: 'Owner',
          inviteLink: 'https://panel.example.com/invite/t',
        },
        4,
      ),
      env(),
    );

    expect(clearReceiptNotifiedMock).not.toHaveBeenCalled();
    expect(clearPlatformReceiptNotifiedMock).not.toHaveBeenCalled();
    expect(retryMock).toHaveBeenCalledTimes(2);
    expect(ackMock).not.toHaveBeenCalled();
  });

  it('success acks and touches nothing', async () => {
    await worker.queue(
      makeBatch({ type: 'email.payment_receipt', paymentId: 42, organizationId: 'org-1' }, 1),
      env(),
    );

    expect(ackMock).toHaveBeenCalledTimes(1);
    expect(retryMock).not.toHaveBeenCalled();
    expect(clearReceiptNotifiedMock).not.toHaveBeenCalled();
    expect(clearPlatformReceiptNotifiedMock).not.toHaveBeenCalled();
  });

  it('a cleanup failure never interrupts the retry', async () => {
    handlePaymentReceiptMock.mockRejectedValue(new Error('smtp dead'));
    clearReceiptNotifiedMock.mockRejectedValue(new Error('db unavailable'));

    await expect(
      worker.queue(
        makeBatch({ type: 'email.payment_receipt', paymentId: 42, organizationId: 'org-1' }, 4),
        env(),
      ),
    ).resolves.toBeUndefined();

    expect(clearReceiptNotifiedMock).toHaveBeenCalledTimes(1);
    expect(retryMock).toHaveBeenCalledTimes(1);
    expect(ackMock).not.toHaveBeenCalled();
  });
});

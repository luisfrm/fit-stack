/**
 * Step-order freeze for the shared step-1 emission core (`receipt-issue.core`).
 *
 * `issueReceipt` owns the sequence both orchestrators used to duplicate:
 * load payment → validate → idempotency → fiscal work → emitter snapshot →
 * claim → capture payer → consume sequence → attach number → release (lost
 * race) → enqueue render. These tests pin the order against faked repositories
 * so a future refactor cannot silently break the invariants:
 *
 * - fiscal work (profile + taxes) and the frozen emitter snapshot run BEFORE
 *   consuming the sequence: a consumed number is never reused, so a failure
 *   there must not burn a correlative;
 * - the payment is CLAIMED before the sequence: taxes + snapshot + actor live
 *   in the claim, the number is attached to the claimed row;
 * - `attachNumber` always precedes `release`;
 * - an `attachNumber` exception is NOT compensated (the number may be persisted);
 * - an attach that returns no number (the payment stopped being `validated`
 *   between the claim and the attach) releases the local number, never queues
 *   the render and fails with `409 NOT_VALIDATED`;
 * - a lost claim never consumes a number: already numbered → idempotent result,
 *   still claimed → `inProgress` (pending), never an error;
 * - the queued event always carries the number `attachNumber` persisted;
 * - both real issuer profiles (panel / console) run the same core against
 *   faked repositories, preserving their current order.
 */
import { describe, expect, it } from 'vitest';
import {
  RECEIPT_RENDER_EVENT_TYPE,
  type FiscalProfile,
  type ReceiptEmitterSnapshot,
  type ReceiptRenderEvent,
} from '@workspace/shared';
import {
  issueReceipt,
  type IssuerProfile,
  type ReceiptIssueDeps,
  type ReceiptIssueOrg,
  type ReceiptIssuePayment,
} from '../../src/services/receipt-issue.core';
import {
  createPanelIssuerProfile,
  type PanelIssuerRepos,
} from '../../src/services/receipts.service';
import {
  createPlatformIssuerProfile,
  type PlatformIssuerRepos,
} from '../../src/services/platform-receipts.service';

const ORG: ReceiptIssueOrg = {
  id: 'org-1',
  name: 'Gym One',
  legalName: null,
  taxId: null,
  address: null,
  countryCode: 'VE',
  primaryCurrency: 'USD',
  timezone: 'America/Caracas',
  fiscalConfig: null,
};

const FISCAL_PROFILE: FiscalProfile = {
  taxes: [],
  disclaimer: ['Aviso legal'],
  docLabel: 'Cédula',
  taxLabel: 'IVA',
  isFormalTaxpayer: false,
};

const EMITTER_SNAPSHOT: ReceiptEmitterSnapshot = {
  version: 1,
  emitter: {
    name: 'Issuer',
    legalName: null,
    taxId: null,
    taxLabel: 'IVA',
    address: null,
    countryCode: 'VE',
    currency: 'USD',
  },
  documentLabel: 'Comprobante de pago',
  recipientDocLabel: 'Cédula',
  disclaimer: ['Aviso legal'],
  timezone: 'America/Caracas',
  taxes: [],
};

function issuePayment(overrides: Partial<ReceiptIssuePayment> = {}): ReceiptIssuePayment {
  return {
    status: 'validated',
    amountPaid: 1000,
    currencyPaid: 'USD',
    planSnapshotCurrency: 'USD',
    receiptNumber: null,
    receiptPdfKey: null,
    organizationId: 'org-1',
    ...overrides,
  };
}

/**
 * Fake profile + fake ports recording every step into a shared order log.
 * `customize` receives the log so overrides (lost race, incoherent number,
 * failures) record themselves in the same sequence.
 */
function orderHarness(
  customize: (ctx: {
    calls: string[];
    payment: ReceiptIssuePayment;
  }) => Partial<IssuerProfile<number>> = () => ({}),
) {
  const calls: string[] = [];
  const payment = issuePayment();
  const profile: IssuerProfile<number> = {
    logTag: 'test',
    releaseFailureLabel: 'test emission',
    incoherentMessage: 'incoherent number',
    resolveYear: () => {
      calls.push('resolveYear');
      return 2026;
    },
    loadPayment: async () => {
      calls.push('loadPayment');
      return payment;
    },
    resolveOrgId: () => {
      calls.push('resolveOrgId');
      return 'org-1';
    },
    resolveFiscal: async () => {
      calls.push('resolveFiscal');
      return {
        profile: FISCAL_PROFILE,
        subtotal: 1000,
        taxTotal: 0,
        taxDetails: [],
      };
    },
    buildEmitterSnapshot: async () => {
      calls.push('buildEmitterSnapshot');
      return EMITTER_SNAPSHOT;
    },
    claim: async () => {
      calls.push('claim');
      return { claimed: true };
    },
    nextNumber: async () => {
      calls.push('nextNumber');
      return { seq: 1, receiptNumber: '2026-000001', coherent: true };
    },
    releaseNumber: async () => {
      calls.push('releaseNumber');
      return { released: true };
    },
    attachNumber: async () => {
      calls.push('attachNumber');
      return { receiptNumber: '2026-000001', receiptPdfKey: null };
    },
    buildRenderEvent: (paymentId, orgId, receiptNumber): ReceiptRenderEvent => {
      calls.push('buildRenderEvent');
      return {
        type: RECEIPT_RENDER_EVENT_TYPE,
        scope: 'panel',
        paymentId,
        organizationId: orgId,
        receiptNumber,
      };
    },
    ...customize({ calls, payment }),
  };
  const deps: ReceiptIssueDeps = {
    orgsRepo: {
      findById: async () => {
        calls.push('orgsRepo.findById');
        return ORG;
      },
    },
    queue: {
      send: async () => {
        calls.push('queue.send');
      },
    },
  };
  return { calls, payment, profile, deps };
}

const INPUT = { orgId: 'org-1', paymentId: 7, timezone: 'America/Caracas' };

describe('issueReceipt — step order (faked ports)', () => {
  it('runs fiscal work before the sequence, claims, attaches the number, then queues the render', async () => {
    const { calls, profile, deps } = orderHarness();

    const result = await issueReceipt(profile, deps, INPUT);

    expect(result).toEqual({
      receiptNumber: '2026-000001',
      pdfStatus: 'pending',
      skipped: false,
    });
    expect(calls).toEqual([
      'resolveYear',
      'loadPayment',
      'resolveOrgId',
      'orgsRepo.findById',
      // Fiscal work BEFORE claiming/consuming the sequence (critical order).
      'resolveFiscal',
      // Frozen emitter identity BEFORE the claim/sequence.
      'buildEmitterSnapshot',
      // The row is claimed BEFORE the sequence is consumed.
      'claim',
      'nextNumber',
      'attachNumber',
      'buildRenderEvent',
      'queue.send',
    ]);
    // `release` is only reachable after a lost race: never on the happy path.
    expect(calls).not.toContain('releaseNumber');
  });

  it('a fiscal failure throws before the claim and the sequence', async () => {
    // Real fiscal failure mode: `resolveFiscalProfile` throws on an unknown
    // country (uncoded `Error`, no silent fallback).
    const { calls, profile, deps } = orderHarness(() => ({
      resolveFiscal: async () => {
        calls.push('resolveFiscal');
        throw new Error('resolveFiscalProfile: countryCode desconocido ("XX").');
      },
    }));

    await expect(issueReceipt(profile, deps, INPUT)).rejects.toThrow(
      /countryCode desconocido/,
    );
    expect(calls).not.toContain('claim');
    expect(calls).not.toContain('nextNumber');
    expect(calls).not.toContain('attachNumber');
    expect(calls).not.toContain('queue.send');
  });

  it('already numbered → re-queues the render without touching the sequence', async () => {
    const { calls, profile, deps } = orderHarness(({ calls: log }) => ({
      loadPayment: async () => {
        log.push('loadPayment');
        return issuePayment({ receiptNumber: '2026-000042', receiptPdfKey: null });
      },
    }));

    const result = await issueReceipt(profile, deps, INPUT);

    expect(result).toEqual({
      receiptNumber: '2026-000042',
      pdfStatus: 'pending',
      skipped: false,
    });
    expect(calls).toEqual(['resolveYear', 'loadPayment', 'resolveOrgId', 'buildRenderEvent', 'queue.send']);
  });

  it('$0 skip returns before org lookup, sequence and queue', async () => {
    const { calls, profile, deps } = orderHarness(() => ({
      shouldSkip: () => true,
    }));

    const result = await issueReceipt(profile, deps, INPUT);

    expect(result).toEqual({ receiptNumber: null, pdfStatus: 'pending', skipped: true });
    expect(calls).toEqual(['resolveYear', 'loadPayment']);
  });

  it('lost race: attachNumber persists another number → release AFTER attach, event carries the persisted one', async () => {
    const { calls, profile, deps } = orderHarness(({ calls: log }) => ({
      attachNumber: async () => {
        log.push('attachNumber');
        return { receiptNumber: '2026-000009', receiptPdfKey: 'org-1/2026-000009.pdf' };
      },
    }));
    const sent: ReceiptRenderEvent[] = [];
    deps.queue.send = async (event) => {
      calls.push('queue.send');
      sent.push(event);
    };

    const result = await issueReceipt(profile, deps, INPUT);

    expect(result).toEqual({
      receiptNumber: '2026-000009',
      pdfStatus: 'ready',
      skipped: false,
    });
    const attachIndex = calls.indexOf('attachNumber');
    const releaseIndex = calls.indexOf('releaseNumber');
    expect(attachIndex).toBeGreaterThan(-1);
    expect(releaseIndex).toBeGreaterThan(attachIndex);
    expect(calls.at(-1)).toBe('queue.send');
    // The event carries the number `attachNumber` persisted, never the local one.
    expect(sent).toEqual([
      {
        type: RECEIPT_RENDER_EVENT_TYPE,
        scope: 'panel',
        paymentId: 7,
        organizationId: 'org-1',
        receiptNumber: '2026-000009',
      },
    ]);
  });

  it('lost claim (no number yet) → inProgress pending, never a consumed number', async () => {
    let reads = 0;
    const { calls, profile, deps } = orderHarness(() => ({
      claim: async () => {
        calls.push('claim');
        return { claimed: false };
      },
      // First read: unclaimed payment; second read (after the lost claim):
      // the row is claimed by the concurrent emission.
      loadPayment: async () => {
        reads += 1;
        calls.push('loadPayment');
        return reads === 1
          ? issuePayment()
          : issuePayment({ receiptClaimAt: new Date('2026-01-01T00:00:00Z') });
      },
    }));

    const result = await issueReceipt(profile, deps, INPUT);

    expect(result).toEqual({
      receiptNumber: null,
      pdfStatus: 'pending',
      skipped: false,
      inProgress: true,
    });
    expect(calls).not.toContain('nextNumber');
    expect(calls).not.toContain('attachNumber');
    expect(calls).not.toContain('queue.send');
  });

  it('lost claim where the number is already persisted → idempotent result, render re-queued if PDF missing', async () => {
    let reads = 0;
    const { calls, profile, deps } = orderHarness(() => ({
      claim: async () => {
        calls.push('claim');
        return { claimed: false };
      },
      loadPayment: async () => {
        reads += 1;
        calls.push('loadPayment');
        return reads === 1
          ? issuePayment()
          : issuePayment({
            receiptNumber: '2026-000042',
            receiptClaimAt: new Date('2026-01-01T00:00:00Z'),
          });
      },
    }));

    const result = await issueReceipt(profile, deps, INPUT);

    expect(result).toEqual({
      receiptNumber: '2026-000042',
      pdfStatus: 'pending',
      skipped: false,
    });
    expect(calls).not.toContain('nextNumber');
    expect(calls).not.toContain('attachNumber');
    expect(calls.slice(-2)).toEqual(['buildRenderEvent', 'queue.send']);
  });

  it('incoherent number: releases the dangling number before throwing, no attach', async () => {
    const { calls, profile, deps } = orderHarness(({ calls: log }) => ({
      nextNumber: async () => {
        log.push('nextNumber');
        return { seq: 1, receiptNumber: 'incoherent', coherent: false };
      },
    }));

    await expect(issueReceipt(profile, deps, INPUT)).rejects.toMatchObject({
      code: 'RECEIPT_INCOHERENT',
      status: 500,
    });
    expect(calls).toEqual([
      'resolveYear',
      'loadPayment',
      'resolveOrgId',
      'orgsRepo.findById',
      'resolveFiscal',
      'buildEmitterSnapshot',
      'claim',
      'nextNumber',
      'releaseNumber',
    ]);
  });

  it('attachNumber returns no number (payment left `validated`) → release, no render, 409 NOT_VALIDATED', async () => {
    const { calls, profile, deps } = orderHarness(({ calls: log }) => ({
      // The repository returns the (now voided) row unchanged: its WHERE
      // requires `status = 'validated'`.
      attachNumber: async () => {
        log.push('attachNumber');
        return { receiptNumber: null, receiptPdfKey: null };
      },
    }));

    await expect(issueReceipt(profile, deps, INPUT)).rejects.toMatchObject({
      code: 'NOT_VALIDATED',
      status: 409,
    });
    // The local correlative is compensated AFTER the attach confirmed that
    // nothing was persisted; the render is never enqueued.
    expect(calls.slice(-2)).toEqual(['attachNumber', 'releaseNumber']);
    expect(calls).not.toContain('queue.send');
    expect(calls).not.toContain('buildRenderEvent');
  });

  it('attachNumber exception is NOT compensated (the number may have been persisted)', async () => {
    const { calls, profile, deps } = orderHarness(({ calls: log }) => ({
      attachNumber: async () => {
        log.push('attachNumber');
        throw new Error('response lost after commit');
      },
    }));

    await expect(issueReceipt(profile, deps, INPUT)).rejects.toThrow(
      'response lost after commit',
    );
    expect(calls).not.toContain('releaseNumber');
    expect(calls).not.toContain('queue.send');
  });
});

/** Panel ports recording every repository call into the shared order log. */
function panelIssuerRepos(order: string[], payment: ReceiptIssuePayment): PanelIssuerRepos {
  return {
    paymentsRepo: {
      findById: async () => {
        order.push('payments.findById');
        return payment;
      },
    },
    receiptsRepo: {
      nextDocumentNumber: async () => {
        order.push('receipts.nextDocumentNumber');
        return 1;
      },
      releaseLastNumber: async () => {
        order.push('receipts.releaseLastNumber');
        return { released: true };
      },
      claimReceipt: async () => {
        order.push('receipts.claimReceipt');
        return { claimed: true };
      },
      attachReceiptNumber: async (_paymentId, _orgId, input) => {
        order.push('receipts.attachReceiptNumber');
        return { receiptNumber: input.receiptNumber, receiptPdfKey: null };
      },
    },
  };
}

/** Console ports recording every repository call into the shared order log. */
function platformIssuerRepos(order: string[], payment: ReceiptIssuePayment): PlatformIssuerRepos {
  return {
    platformSubsRepo: {
      findPaymentById: async () => {
        order.push('platformSubs.findPaymentById');
        return payment;
      },
    },
    platformReceiptsRepo: {
      nextPlatformDocumentNumber: async () => {
        order.push('platformReceipts.nextPlatformDocumentNumber');
        return 1;
      },
      releaseLastPlatformNumber: async () => {
        order.push('platformReceipts.releaseLastPlatformNumber');
        return { released: true };
      },
      claimPlatformReceipt: async () => {
        order.push('platformReceipts.claimPlatformReceipt');
        return { claimed: true };
      },
      attachPlatformReceiptNumber: async (_paymentId, input) => {
        order.push('platformReceipts.attachPlatformReceiptNumber');
        return { receiptNumber: input.receiptNumber, receiptPdfKey: null };
      },
      setPlatformPayerIfMissing: async () => {
        order.push('platformReceipts.setPlatformPayerIfMissing');
      },
    },
    platformSettingsRepo: {
      getAll: async () => {
        order.push('platformSettings.getAll');
        return {};
      },
    },
  };
}

describe('issuer profiles — real strategies against faked repositories', () => {
  it('panel: org lookup, claim then sequence and attach; the claim carries the fiscal work', async () => {
    const order: string[] = [];
    const repos = panelIssuerRepos(order, issuePayment());
    type ClaimArg = Parameters<PanelIssuerRepos['receiptsRepo']['claimReceipt']>[2];
    type AttachArg = Parameters<PanelIssuerRepos['receiptsRepo']['attachReceiptNumber']>[2];
    let claimPayload: ClaimArg | null = null;
    let attachPayload: AttachArg | null = null;
    const originalClaim = repos.receiptsRepo.claimReceipt;
    repos.receiptsRepo.claimReceipt = async (paymentId, orgId, input) => {
      claimPayload = input;
      return originalClaim(paymentId, orgId, input);
    };
    const originalAttach = repos.receiptsRepo.attachReceiptNumber;
    repos.receiptsRepo.attachReceiptNumber = async (paymentId, orgId, input) => {
      attachPayload = input;
      return originalAttach(paymentId, orgId, input);
    };
    const profile = createPanelIssuerProfile(repos);
    const deps: ReceiptIssueDeps = {
      orgsRepo: {
        findById: async () => {
          order.push('orgs.findById');
          return ORG;
        },
      },
      queue: {
        send: async () => {
          order.push('queue.send');
        },
      },
    };

    const result = await issueReceipt(profile, deps, {
      ...INPUT,
      actor: 'user-1',
    });

    expect(result).toEqual({
      receiptNumber: '2026-000001',
      pdfStatus: 'pending',
      skipped: false,
    });
    expect(order).toEqual([
      'payments.findById',
      'orgs.findById',
      'receipts.claimReceipt',
      'receipts.nextDocumentNumber',
      'receipts.attachReceiptNumber',
      'queue.send',
    ]);
    // Fiscal work happened before the claim: the claim payload carries it.
    expect(claimPayload).toMatchObject({
      subtotal: 1000,
      taxTotal: 0,
      taxDetails: [],
      issuedBy: 'user-1',
    });
    expect(claimPayload?.['emitterSnapshot']).toMatchObject({ version: 1 });
    // The attach persists ONLY the number: taxes/snapshot live in the claim.
    expect(attachPayload).toMatchObject({
      receiptNumber: '2026-000001',
      documentType: 'receipt',
    });
    expect(attachPayload).not.toHaveProperty('subtotal');
  });

  it('console: settings read BEFORE the claim, payer captured, platform scope', async () => {
    const order: string[] = [];
    const payment = issuePayment({ organizationId: 'org-2', amountPaid: 2500 });
    const profile = createPlatformIssuerProfile(platformIssuerRepos(order, payment));
    const deps: ReceiptIssueDeps = {
      orgsRepo: {
        findById: async () => {
          order.push('orgs.findById');
          return ORG;
        },
      },
      queue: {
        send: async () => {
          order.push('queue.send');
        },
      },
    };

    const result = await issueReceipt(profile, deps, {
      paymentId: 9,
      payerEmail: 'payer@example.com',
      payerName: 'Payer',
      actor: 'user-2',
    });

    expect(result).toEqual({
      receiptNumber: 'FS-0000001',
      pdfStatus: 'pending',
      skipped: false,
    });
    expect(order).toEqual([
      'platformSubs.findPaymentById',
      'orgs.findById',
      // Frozen emitter identity (settings) BEFORE the claim/sequence.
      'platformSettings.getAll',
      'platformReceipts.claimPlatformReceipt',
      'platformReceipts.setPlatformPayerIfMissing',
      'platformReceipts.nextPlatformDocumentNumber',
      'platformReceipts.attachPlatformReceiptNumber',
      'queue.send',
    ]);
  });

  it('console: $0 trial/free skips before org lookup and sequence', async () => {
    const order: string[] = [];
    const profile = createPlatformIssuerProfile(
      platformIssuerRepos(order, issuePayment({ amountPaid: 0 })),
    );
    const deps: ReceiptIssueDeps = {
      orgsRepo: {
        findById: async () => {
          order.push('orgs.findById');
          return ORG;
        },
      },
      queue: {
        send: async () => {
          order.push('queue.send');
        },
      },
    };

    const result = await issueReceipt(profile, deps, { paymentId: 9 });

    expect(result).toEqual({ receiptNumber: null, pdfStatus: 'pending', skipped: true });
    expect(order).toEqual(['platformSubs.findPaymentById']);
  });

  it('console lost race: release AFTER attach, platform event carries the persisted number', async () => {
    const order: string[] = [];
    const payment = issuePayment({ organizationId: 'org-2', amountPaid: 2500 });
    const repos = platformIssuerRepos(order, payment);
    repos.platformReceiptsRepo.attachPlatformReceiptNumber = async () => {
      order.push('platformReceipts.attachPlatformReceiptNumber');
      return { receiptNumber: 'FS-0000007', receiptPdfKey: null };
    };
    const profile = createPlatformIssuerProfile(repos);
    const sent: ReceiptRenderEvent[] = [];
    const deps: ReceiptIssueDeps = {
      orgsRepo: {
        findById: async () => {
          order.push('orgs.findById');
          return ORG;
        },
      },
      queue: {
        send: async (event) => {
          order.push('queue.send');
          sent.push(event);
        },
      },
    };

    const result = await issueReceipt(profile, deps, { paymentId: 9 });

    expect(result).toEqual({
      receiptNumber: 'FS-0000007',
      pdfStatus: 'pending',
      skipped: false,
    });
    const attachIndex = order.indexOf('platformReceipts.attachPlatformReceiptNumber');
    const releaseIndex = order.indexOf('platformReceipts.releaseLastPlatformNumber');
    expect(attachIndex).toBeGreaterThan(-1);
    expect(releaseIndex).toBeGreaterThan(attachIndex);
    expect(sent).toEqual([
      {
        type: RECEIPT_RENDER_EVENT_TYPE,
        scope: 'platform',
        paymentId: 9,
        organizationId: 'org-2',
        receiptNumber: 'FS-0000007',
      },
    ]);
  });
});

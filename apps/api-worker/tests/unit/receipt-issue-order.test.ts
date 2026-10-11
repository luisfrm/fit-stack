/**
 * Step-order freeze for the shared step-1 emission core (`receipt-issue.core`).
 *
 * `issueReceipt` owns the sequence both orchestrators used to duplicate:
 * load payment → validate → idempotency → fiscal work → anti-race re-read →
 * emitter snapshot → consume sequence → attach → release (lost race) →
 * enqueue render. These tests pin the order against faked repositories so a
 * future refactor cannot silently break the invariants:
 *
 * - fiscal work (profile + taxes) and the frozen emitter snapshot run BEFORE
 *   consuming the sequence: a consumed number is never reused, so a failure
 *   there must not burn a correlative;
 * - `attach` always precedes `release`;
 * - an `attach` exception is NOT compensated (the number may be persisted);
 * - the queued event always carries the number `attach` persisted;
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
  ReceiptError,
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
        taxOverrideReason: null,
      };
    },
    buildEmitterSnapshot: async () => {
      calls.push('buildEmitterSnapshot');
      return EMITTER_SNAPSHOT;
    },
    nextNumber: async () => {
      calls.push('nextNumber');
      return { seq: 1, receiptNumber: '2026-000001', coherent: true };
    },
    releaseNumber: async () => {
      calls.push('releaseNumber');
      return { released: true };
    },
    attach: async () => {
      calls.push('attach');
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
  it('runs fiscal work before the sequence, attaches, then queues the render', async () => {
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
      // Fiscal work BEFORE consuming the sequence (critical order).
      'resolveFiscal',
      // Anti-race re-read BEFORE consuming the sequence.
      'loadPayment',
      // Frozen emitter identity BEFORE consuming the sequence.
      'buildEmitterSnapshot',
      'nextNumber',
      'attach',
      'buildRenderEvent',
      'queue.send',
    ]);
    // `release` is only reachable after a lost race: never on the happy path.
    expect(calls).not.toContain('releaseNumber');
  });

  it('a fiscal failure throws before the sequence is ever consumed', async () => {
    const { calls, profile, deps } = orderHarness(() => ({
      resolveFiscal: async () => {
        calls.push('resolveFiscal');
        throw new ReceiptError(400, 'TAX_MISMATCH', 'El desglose no cuadra.');
      },
    }));

    await expect(issueReceipt(profile, deps, INPUT)).rejects.toMatchObject({
      code: 'TAX_MISMATCH',
    });
    expect(calls).not.toContain('nextNumber');
    expect(calls).not.toContain('attach');
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

  it('lost race: attach persists another number → release AFTER attach, event carries the persisted one', async () => {
    const { calls, profile, deps } = orderHarness(({ calls: log }) => ({
      attach: async () => {
        log.push('attach');
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
    const attachIndex = calls.indexOf('attach');
    const releaseIndex = calls.indexOf('releaseNumber');
    expect(attachIndex).toBeGreaterThan(-1);
    expect(releaseIndex).toBeGreaterThan(attachIndex);
    expect(calls.at(-1)).toBe('queue.send');
    // The event carries the number `attach` persisted, never the local one.
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
      'loadPayment',
      'buildEmitterSnapshot',
      'nextNumber',
      'releaseNumber',
    ]);
  });

  it('attach exception is NOT compensated (the number may have been persisted)', async () => {
    const { calls, profile, deps } = orderHarness(({ calls: log }) => ({
      attach: async () => {
        log.push('attach');
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
      attachReceipt: async (_paymentId, _orgId, input) => {
        order.push('receipts.attachReceipt');
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
      attachPlatformReceipt: async (_paymentId, input) => {
        order.push('platformReceipts.attachPlatformReceipt');
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
  it('panel: org lookup, sequence and attach in the current order; attach carries the fiscal work', async () => {
    const order: string[] = [];
    const repos = panelIssuerRepos(order, issuePayment());
    type AttachArg = Parameters<PanelIssuerRepos['receiptsRepo']['attachReceipt']>[2];
    let attachPayload: AttachArg | null = null;
    const originalAttach = repos.receiptsRepo.attachReceipt;
    repos.receiptsRepo.attachReceipt = async (paymentId, orgId, input) => {
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
      // Anti-race re-read before consuming the sequence.
      'payments.findById',
      'receipts.nextDocumentNumber',
      'receipts.attachReceipt',
      'queue.send',
    ]);
    // Fiscal work happened before `attach`: the payload carries it.
    expect(attachPayload).toMatchObject({
      receiptNumber: '2026-000001',
      documentType: 'receipt',
      subtotal: 1000,
      taxTotal: 0,
      taxDetails: [],
      issuedBy: 'user-1',
    });
    expect(attachPayload?.['emitterSnapshot']).toMatchObject({ version: 1 });
  });

  it('console: settings read BEFORE the sequence, payer captured, platform scope', async () => {
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
      'platformSubs.findPaymentById',
      // Frozen emitter identity (settings) BEFORE consuming the sequence.
      'platformSettings.getAll',
      'platformReceipts.nextPlatformDocumentNumber',
      'platformReceipts.setPlatformPayerIfMissing',
      'platformReceipts.attachPlatformReceipt',
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
    repos.platformReceiptsRepo.attachPlatformReceipt = async () => {
      order.push('platformReceipts.attachPlatformReceipt');
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
    const attachIndex = order.indexOf('platformReceipts.attachPlatformReceipt');
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

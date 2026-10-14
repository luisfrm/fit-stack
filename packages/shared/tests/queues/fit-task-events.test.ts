/**
 * `fit-task-events` contract: validated builders + consumer type-guard.
 */
import { describe, expect, it } from 'vitest';
import {
  ORG_INVITE_EVENT_TYPE,
  ORG_PAYMENT_RECEIVED_EVENT_TYPE,
  PAYMENT_RECEIPT_EVENT_TYPE,
  REGISTRATION_INVITE_EVENT_TYPE,
  buildOrgInviteEvent,
  buildOrgPaymentReceivedEvent,
  buildPaymentReceiptEvent,
  buildRegistrationInviteEvent,
  isFitTaskEvent,
} from '../../src/queues/fit-task-events';

const REGISTRATION_INVITE = {
  email: 'staff@example.com',
  token: 'invite-token',
};

const ORG_INVITE = {
  email: 'owner@example.com',
  orgName: 'Gym Fit Stack',
  inviterName: 'Ana Owner',
  inviteLink: 'https://panel.example.com/accept-invitation/abc',
};

const PAYMENT_RECEIPT = {
  paymentId: 42,
  organizationId: 'org-1',
};

const ORG_PAYMENT_RECEIVED = {
  paymentId: 7,
  organizationId: 'org-1',
};

describe('buildRegistrationInviteEvent', () => {
  it('defaults target to panel and omits an absent role', () => {
    expect(buildRegistrationInviteEvent(REGISTRATION_INVITE)).toEqual({
      type: 'email.registration_invite',
      target: 'panel',
      ...REGISTRATION_INVITE,
    });
    expect(REGISTRATION_INVITE_EVENT_TYPE).toBe('email.registration_invite');
  });

  it('keeps an explicit console target and role', () => {
    expect(
      buildRegistrationInviteEvent({
        ...REGISTRATION_INVITE,
        target: 'console',
        role: 'support',
      }),
    ).toEqual({
      type: 'email.registration_invite',
      ...REGISTRATION_INVITE,
      target: 'console',
      role: 'support',
    });
  });

  it.each([
    [{ ...REGISTRATION_INVITE, email: '' }],
    [{ ...REGISTRATION_INVITE, email: '   ' }],
    [{ ...REGISTRATION_INVITE, email: 'not-an-email' }],
    [{ ...REGISTRATION_INVITE, token: '' }],
    [{ ...REGISTRATION_INVITE, token: '  ' }],
    [{ ...REGISTRATION_INVITE, target: 'portal' }],
    [{ ...REGISTRATION_INVITE, role: 42 }],
  ])('throws on invalid input %j', (input) => {
    expect(() => buildRegistrationInviteEvent(input as never)).toThrow();
  });
});

describe('buildOrgInviteEvent', () => {
  it('builds the validated event', () => {
    expect(buildOrgInviteEvent(ORG_INVITE)).toEqual({
      type: 'email.org_invite',
      ...ORG_INVITE,
    });
    expect(ORG_INVITE_EVENT_TYPE).toBe('email.org_invite');
  });

  it.each([
    [{ ...ORG_INVITE, email: 'no-at-sign' }],
    [{ ...ORG_INVITE, orgName: '' }],
    [{ ...ORG_INVITE, orgName: '  ' }],
    [{ ...ORG_INVITE, inviterName: '' }],
    [{ ...ORG_INVITE, inviteLink: 'panel.example.com/invite' }],
    [{ ...ORG_INVITE, inviteLink: '' }],
  ])('throws on invalid input %j', (input) => {
    expect(() => buildOrgInviteEvent(input)).toThrow();
  });
});

describe('buildPaymentReceiptEvent', () => {
  it('builds the validated event without a receiptNumber (DB is the source of truth)', () => {
    expect(buildPaymentReceiptEvent(PAYMENT_RECEIPT)).toEqual({
      type: 'email.payment_receipt',
      ...PAYMENT_RECEIPT,
    });
    expect(PAYMENT_RECEIPT_EVENT_TYPE).toBe('email.payment_receipt');
    expect(Object.keys(buildPaymentReceiptEvent(PAYMENT_RECEIPT))).not.toContain('receiptNumber');
  });

  it.each([
    [{ ...PAYMENT_RECEIPT, paymentId: 0 }],
    [{ ...PAYMENT_RECEIPT, paymentId: -1 }],
    [{ ...PAYMENT_RECEIPT, paymentId: 1.5 }],
    [{ ...PAYMENT_RECEIPT, paymentId: '42' }],
    [{ ...PAYMENT_RECEIPT, organizationId: '' }],
    [{ ...PAYMENT_RECEIPT, organizationId: '   ' }],
  ])('throws on invalid input %j', (input) => {
    expect(() => buildPaymentReceiptEvent(input as never)).toThrow();
  });
});

describe('buildOrgPaymentReceivedEvent', () => {
  it('omits both payer fields when the payer email is absent', () => {
    expect(buildOrgPaymentReceivedEvent(ORG_PAYMENT_RECEIVED)).toEqual({
      type: 'email.org_payment_received',
      ...ORG_PAYMENT_RECEIVED,
    });
    expect(
      buildOrgPaymentReceivedEvent({ ...ORG_PAYMENT_RECEIVED, payerEmail: null }),
    ).not.toHaveProperty('payerEmail');
    expect(
      buildOrgPaymentReceivedEvent({ ...ORG_PAYMENT_RECEIVED, payerEmail: '   ' }),
    ).not.toHaveProperty('payerName');
    expect(ORG_PAYMENT_RECEIVED_EVENT_TYPE).toBe('email.org_payment_received');
  });

  it('includes the payer and defaults payerName to an empty string', () => {
    expect(
      buildOrgPaymentReceivedEvent({ ...ORG_PAYMENT_RECEIVED, payerEmail: 'payer@example.com' }),
    ).toEqual({
      type: 'email.org_payment_received',
      ...ORG_PAYMENT_RECEIVED,
      payerEmail: 'payer@example.com',
      payerName: '',
    });
    expect(
      buildOrgPaymentReceivedEvent({
        ...ORG_PAYMENT_RECEIVED,
        payerEmail: 'payer@example.com',
        payerName: '  Ana  ',
      }),
    ).toEqual({
      type: 'email.org_payment_received',
      ...ORG_PAYMENT_RECEIVED,
      payerEmail: 'payer@example.com',
      payerName: 'Ana',
    });
  });

  it.each([
    [{ ...ORG_PAYMENT_RECEIVED, paymentId: 0 }],
    [{ ...ORG_PAYMENT_RECEIVED, organizationId: '  ' }],
    [{ ...ORG_PAYMENT_RECEIVED, payerEmail: 'broken-email' }],
  ])('throws on invalid input %j', (input) => {
    expect(() => buildOrgPaymentReceivedEvent(input)).toThrow();
  });
});

describe('isFitTaskEvent', () => {
  it('accepts every event built by the four builders', () => {
    expect(isFitTaskEvent(buildRegistrationInviteEvent(REGISTRATION_INVITE))).toBe(true);
    expect(isFitTaskEvent(buildOrgInviteEvent(ORG_INVITE))).toBe(true);
    expect(isFitTaskEvent(buildPaymentReceiptEvent(PAYMENT_RECEIPT))).toBe(true);
    expect(isFitTaskEvent(buildOrgPaymentReceivedEvent(ORG_PAYMENT_RECEIVED))).toBe(true);
  });

  it('accepts a registration invite without target/role (in-flight events)', () => {
    expect(
      isFitTaskEvent({ type: 'email.registration_invite', email: 'a@b.com', token: 't' }),
    ).toBe(true);
  });

  it('accepts a payment receipt carrying a legacy receiptNumber key (wire compat)', () => {
    expect(
      isFitTaskEvent({
        type: 'email.payment_receipt',
        paymentId: 1,
        organizationId: 'o',
        receiptNumber: 'fit-stack-2026-000045',
      }),
    ).toBe(true);
  });

  it.each([
    null,
    undefined,
    'email.payment_receipt',
    42,
    { type: 'receipt.render', scope: 'panel', paymentId: 1, organizationId: 'o', receiptNumber: 'n' },
    [],
    { type: 'email.payment_receipt', paymentId: '42', organizationId: 'o' },
    { type: 'email.payment_receipt', paymentId: 1 },
    { type: 'email.org_payment_received', paymentId: 1, organizationId: 'o', payerEmail: 7 },
    { type: 'email.org_invite', email: 'a@b.com', orgName: 'Gym', inviterName: 'Ana' },
    { type: 'email.registration_invite', email: 'a@b.com', token: 't', target: 'portal' },
    { type: 'email.registration_invite', token: 't' },
    { type: 'email.totally_new' },
  ])('rejects %j', (v) => {
    expect(isFitTaskEvent(v)).toBe(false);
  });
});

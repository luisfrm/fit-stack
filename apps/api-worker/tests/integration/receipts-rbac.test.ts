/**
 * Receipts RBAC (Phase 6 — Panel closure).
 *
 * Small and dedicated file: `receipts-emission.test.ts` is already God and is
 * not touched. Covers the missing negative gates:
 * - coach → 403 on `GET /:id/receipt` (gate `SUBSCRIPTIONS.READ`).
 * - member → 403 on `POST /:id/issue` (gate `SUBSCRIPTIONS.UPDATE`).
 *
 * Note: `POST /:id/send-email` is `READ`, not a write gate — it is not
 * tested here as a gate.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import {
  assertSchemaReady,
  skipReason,
  testQuery,
  truncateAll,
} from '../helpers/db';
import {
  createGymTenant,
  addUserToOrganization,
  createGymMember,
  createPlan,
  isoDate,
} from '../helpers/auth';
import { ORG_ROLES } from '@workspace/shared';

describe.skipIf(skipReason !== null)('Receipts RBAC (Fase 6)', () => {
  beforeAll(async () => {
    await assertSchemaReady();
    await truncateAll();
  });

  /** Tenant + `validated` payment (numbered in step 1) via HTTP. */
  async function createNumberedPaymentId() {
    const { owner, organization } = await createGymTenant('rbac');
    const member = await createGymMember(owner.client);
    const plan = await createPlan(owner.client, { price: 10000, currency: 'USD' });
    const res = await owner.client.post('/api/subscriptions', {
      memberId: member.id,
      planId: plan.id,
      startDate: isoDate(0),
      endDate: isoDate(30),
      payment: {
        amountPaid: 10000,
        currencyPaid: 'USD',
        paymentMethod: 'cash',
        paymentMethodDetails: [],
        status: 'validated',
        paymentDate: isoDate(0),
      },
    });
    expect(res.status, res.text).toBe(201);
    const rows = await testQuery<{ id: number }>(
      `SELECT id FROM payment WHERE subscription_id = $1`,
      [res.body.id],
    );
    return { organizationId: organization.id, paymentId: rows[0]!.id };
  }

  it('coach → 403 en GET /:id/receipt (sin SUBSCRIPTIONS.READ)', async () => {
    const { organizationId, paymentId } = await createNumberedPaymentId();
    const coach = await addUserToOrganization(organizationId, ORG_ROLES.COACH, 'rbac-coach');
    const res = await coach.client.get(`/api/payments/${paymentId}/receipt`);
    expect(res.status, res.text).toBe(403);
  });

  it('member → 403 en POST /:id/issue (sin SUBSCRIPTIONS.UPDATE)', async () => {
    const { organizationId, paymentId } = await createNumberedPaymentId();
    const member = await addUserToOrganization(organizationId, ORG_ROLES.MEMBER, 'rbac-member');
    const res = await member.client.post(`/api/payments/${paymentId}/issue`, {});
    expect(res.status, res.text).toBe(403);
  });
});

/**
 * Receipts RBAC (Fase 6 — cierre Panel).
 *
 * Archivo pequeño y dedicado: `receipts-emission.test.ts` ya es God y no se
 * toca. Cubre los gates negativos que faltaban:
 * - coach → 403 en `GET /:id/receipt` (puerta `SUBSCRIPTIONS.READ`).
 * - member → 403 en `POST /:id/issue` (puerta `SUBSCRIPTIONS.UPDATE`).
 *
 * Nota: `POST /:id/send-email` es `READ`, no puerta de escritura — no se
 * testea aquí como gate.
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

  /** Tenant + pago `validated` (numerado en el paso 1) vía HTTP. */
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

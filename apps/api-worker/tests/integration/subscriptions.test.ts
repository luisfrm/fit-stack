/**
 * Subscriptions integration tests.
 *
 * Covers: the full subscription lifecycle — create (with atomic payment),
 * list, cancel — plus permission enforcement and org isolation.
 *
 * Flow tested: create member → create plan → POST /api/subscriptions (atomic)
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '../helpers/client';
import { assertSchemaReady, skipReason, testQuery, truncateAll } from '../helpers/db';
import {
  createGymTenant,
  addUserToOrganization,
  createGymMember,
  createPlan,
  isoDate,
} from '../helpers/auth';
import { ORG_ROLES } from '@workspace/shared';

describe.skipIf(skipReason !== null)('Subscriptions API', () => {
  beforeAll(async () => {
    await assertSchemaReady();
    await truncateAll();
  });

  /** Helper: create a member + plan and return their IDs for subscription tests. */
  async function setupSubscriptionFixture() {
    const { owner, organization } = await createGymTenant();
    const member = await createGymMember(owner.client);
    const plan = await createPlan(owner.client, { price: 100, currency: 'USD' });
    return { owner, organization, member, plan };
  }

  describe('POST /api/subscriptions', () => {
    it('creates a subscription with atomic payment', async () => {
      const { owner, member, plan } = await setupSubscriptionFixture();

      const res = await owner.client.post('/api/subscriptions', {
        memberId: member.id,
        planId: plan.id,
        startDate: isoDate(0),
        endDate: isoDate(30),
        payment: {
          amountPaid: 100,
          currencyPaid: 'USD',
          paymentMethod: 'cash',
          paymentMethodDetails: [
            { label: 'Referencia', value: 'REF-123', type: 'text' },
          ],
          status: 'validated',
          paymentDate: isoDate(0),
        },
      });

      expect(res.status, res.text).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.memberId).toBe(member.id);
      expect(res.body.planId).toBe(plan.id);
    });

    it('validated payment numbers the receipt and enqueues render (email waits for step 2)', async () => {
      const { owner, organization, member, plan } = await setupSubscriptionFixture();
      owner.client.queue.reset();
      owner.client.receiptQueue.reset();

      const res = await owner.client.post('/api/subscriptions', {
        memberId: member.id,
        planId: plan.id,
        startDate: isoDate(0),
        endDate: isoDate(30),
        payment: {
          amountPaid: 100,
          currencyPaid: 'USD',
          paymentMethod: 'cash',
          paymentMethodDetails: [],
          status: 'validated',
          paymentDate: isoDate(0),
        },
      });
      expect(res.status, res.text).toBe(201);

      // Paso 1: número + render encolado; el email lo encola el paso 2 (Fase 2).
      const renders = owner.client.receiptQueue.ofType('receipt.render');
      expect(renders).toHaveLength(1);
      expect(renders[0].organizationId).toBe(organization.id);
      expect(owner.client.queue.ofType('email.payment_receipt')).toHaveLength(0);
    });

    it('processing payment does NOT enqueue a receipt (awaits validation)', async () => {
      const { owner, member, plan } = await setupSubscriptionFixture();
      owner.client.queue.reset();

      const res = await owner.client.post('/api/subscriptions', {
        memberId: member.id,
        planId: plan.id,
        startDate: isoDate(0),
        endDate: isoDate(30),
        payment: {
          amountPaid: 100,
          currencyPaid: 'USD',
          paymentMethod: 'transfer',
          paymentMethodDetails: [],
          status: 'processing',
          paymentDate: isoDate(0),
        },
      });
      expect(res.status, res.text).toBe(201);

      expect(owner.client.queue.ofType('email.payment_receipt')).toHaveLength(0);
    });

    it('rejects object-shaped paymentMethodDetails (contract is an array)', async () => {
      const { owner, member, plan } = await setupSubscriptionFixture();

      const res = await owner.client.post('/api/subscriptions', {
        memberId: member.id,
        planId: plan.id,
        startDate: isoDate(0),
        endDate: isoDate(30),
        payment: {
          amountPaid: 100,
          currencyPaid: 'USD',
          paymentMethod: 'cash',
          paymentMethodDetails: { reference: 'REF-123' },
          status: 'validated',
          paymentDate: isoDate(0),
        },
      });

      expect(res.status, res.text).toBe(400);
    });

    it('returns the created subscription with correct IDs', async () => {
      const { owner, member, plan } = await setupSubscriptionFixture();

      const res = await owner.client.post('/api/subscriptions', {
        memberId: member.id,
        planId: plan.id,
        startDate: isoDate(0),
        endDate: isoDate(30),
        payment: {
          amountPaid: 50,
          currencyPaid: 'USD',
          paymentMethod: 'zelle',
          status: 'validated',
          paymentDate: isoDate(0),
        },
      });

      expect(res.status, res.text).toBe(201);
      expect(res.body.memberId).toBe(member.id);
      expect(res.body.planId).toBe(plan.id);
    });

    it('rejects creation with invalid memberId', async () => {
      const { owner, plan } = await setupSubscriptionFixture();

      const res = await owner.client.post('/api/subscriptions', {
        memberId: 999999,
        planId: plan.id,
        startDate: isoDate(0),
        endDate: isoDate(30),
        payment: {
          amountPaid: 100,
          currencyPaid: 'USD',
          paymentMethod: 'cash',
        },
      });

      // memberId doesn't exist in this org — 400 with error envelope, not a FK crash
      expect(res.status, res.text).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('rejects creation with invalid planId', async () => {
      const { owner, member } = await setupSubscriptionFixture();

      const res = await owner.client.post('/api/subscriptions', {
        memberId: member.id,
        planId: 999999,
        startDate: isoDate(0),
        endDate: isoDate(30),
        payment: {
          amountPaid: 100,
          currencyPaid: 'USD',
          paymentMethod: 'cash',
        },
      });

      // planId doesn't exist in this org — 400 with error envelope, not a FK crash
      expect(res.status, res.text).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('rejects creation with missing payment', async () => {
      const { owner, member, plan } = await setupSubscriptionFixture();

      const res = await owner.client.post('/api/subscriptions', {
        memberId: member.id,
        planId: plan.id,
        startDate: isoDate(0),
        endDate: isoDate(30),
      });

      expect(res.status, res.text).toBe(400);
    });

    it('rejects unauthenticated creation', async () => {
      const client = createClient();
      const res = await client.post('/api/subscriptions', {
        memberId: 1,
        planId: 1,
        startDate: isoDate(0),
        endDate: isoDate(30),
        payment: { amountPaid: 100, currencyPaid: 'USD', paymentMethod: 'cash' },
      }, { anonymous: true });

      expect(res.status, res.text).toBe(401);
    });
  });

  describe('GET /api/subscriptions', () => {
    it('returns paginated subscriptions', async () => {
      const { owner, member, plan } = await setupSubscriptionFixture();

      // Create two subscriptions
      await owner.client.post('/api/subscriptions', {
        memberId: member.id,
        planId: plan.id,
        startDate: isoDate(0),
        endDate: isoDate(30),
        payment: { amountPaid: 100, currencyPaid: 'USD', paymentMethod: 'cash' },
      });
      await owner.client.post('/api/subscriptions', {
        memberId: member.id,
        planId: plan.id,
        startDate: isoDate(31),
        endDate: isoDate(61),
        payment: { amountPaid: 100, currencyPaid: 'USD', paymentMethod: 'cash' },
      });

      const res = await owner.client.get('/api/subscriptions');
      expect(res.status, res.text).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
      expect(res.body).toHaveProperty('total');
    });

    it('returns recent subscriptions', async () => {
      const { owner, member, plan } = await setupSubscriptionFixture();

      await owner.client.post('/api/subscriptions', {
        memberId: member.id,
        planId: plan.id,
        startDate: isoDate(0),
        endDate: isoDate(30),
        payment: { amountPaid: 100, currencyPaid: 'USD', paymentMethod: 'cash' },
      });

      const res = await owner.client.get('/api/subscriptions/recent', { query: { limit: '3' } });
      expect(res.status, res.text).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('PUT /api/subscriptions/:id', () => {
    it('cancels an active subscription (sets cancelledAt)', async () => {
      const { owner, member, plan } = await setupSubscriptionFixture();

      const created = await owner.client.post('/api/subscriptions', {
        memberId: member.id,
        planId: plan.id,
        startDate: isoDate(0),
        endDate: isoDate(30),
        payment: { amountPaid: 100, currencyPaid: 'USD', paymentMethod: 'cash' },
      });

      const subId = created.body.id;
      const res = await owner.client.put(`/api/subscriptions/${subId}`, {
        status: 'cancelled',
      });

      expect(res.status, res.text).toBe(200);
      // The API returns the raw subscription row; cancelledAt is set to now
      expect(res.body.cancelledAt).not.toBeNull();
    });
  });

  describe('Estado derivado (anulada vs revocada)', () => {
    /** Crea una sub con pago `validated` y devuelve su id + el del pago. */
    async function seedSubscription(owner: any, member: any, plan: any) {
      const created = await owner.client.post('/api/subscriptions', {
        memberId: member.id,
        planId: plan.id,
        startDate: isoDate(0),
        endDate: isoDate(30),
        payment: {
          amountPaid: 100,
          currencyPaid: 'USD',
          paymentMethod: 'cash',
          status: 'validated',
          paymentDate: isoDate(0),
        },
      });
      const list = await owner.client.get<{ data: any[] }>('/api/subscriptions', {
        query: { limit: '10' },
      });
      const row = list.body.data.find((r) => r.id === created.body.id);
      return { subId: created.body.id as number, paymentId: row?.paymentId as number };
    }

    async function readStatus(owner: any, subId: number) {
      const res = await owner.client.get<{ data: any[] }>('/api/subscriptions', {
        query: { limit: '10' },
      });
      return res.body.data.find((r) => r.id === subId)?.status;
    }

    it('anular el cobro deja la suscripción ANULADA (`voided`), no cancelada', async () => {
      const { owner, member, plan } = await setupSubscriptionFixture();
      const { subId, paymentId } = await seedSubscription(owner, member, plan);
      expect(paymentId).toBeTruthy();
      expect(await readStatus(owner, subId)).toBe('active');

      const voided = await owner.client.patch(`/api/payments/${paymentId}/status`, {
        status: 'voided',
      });
      expect(voided.status, voided.text).toBe(200);

      // Anulada ≠ cancelada: el registro es inválido, no es una revocación.
      expect(await readStatus(owner, subId)).toBe('voided');
    });

    it('rechazar el cobro ya no es un estado propio: `invalid` responde 400 (schema)', async () => {
      const { owner, member, plan } = await setupSubscriptionFixture();
      const { paymentId } = await seedSubscription(owner, member, plan);

      const res = await owner.client.patch(`/api/payments/${paymentId}/status`, {
        status: 'invalid',
      });

      // `invalid`/`pending` desaparecieron del contrato: el enum solo acepta
      // processing | validated | voided. El schema rechaza antes del servicio.
      expect(res.status, res.text).toBe(400);
    });

    it('rechazar un cobro `processing` (`voided`) deja la suscripción ANULADA con auditoría persistida', async () => {
      const { owner, member, plan } = await setupSubscriptionFixture();

      // Alta con pago `processing`: no emite comprobante (queda en revisión).
      const created = await owner.client.post('/api/subscriptions', {
        memberId: member.id,
        planId: plan.id,
        startDate: isoDate(0),
        endDate: isoDate(30),
        payment: {
          amountPaid: 100,
          currencyPaid: 'USD',
          paymentMethod: 'transfer',
          paymentMethodDetails: [],
          status: 'processing',
          paymentDate: isoDate(0),
        },
      });
      expect(created.status, created.text).toBe(201);

      const list = await owner.client.get<{ data: any[] }>('/api/subscriptions', {
        query: { limit: '10' },
      });
      const paymentId = list.body.data.find((r) => r.id === created.body.id)?.paymentId as number;
      expect(paymentId).toBeTruthy();

      const voided = await owner.client.patch(`/api/payments/${paymentId}/status`, {
        status: 'voided',
        voidReason: 'Comprobante ilegible',
      });
      expect(voided.status, voided.text).toBe(200);
      // C6: rechazar sin comprobante emitido responde 200 y lo dice.
      expect(voided.body).toMatchObject({
        receiptVoided: false,
        receiptVoidReason: 'not_issued',
      });

      // El status derivado es ANULADA (registro inválido), no cancelada.
      expect(await readStatus(owner, created.body.id)).toBe('voided');

      // La auditoría se persiste SIEMPRE al anular, haya o no comprobante.
      const rows = await testQuery<{
        status: string;
        void_reason: string | null;
        voided_at: string | null;
        voided_by: string | null;
        receipt_number: string | null;
      }>(
        `SELECT status, void_reason, voided_at, voided_by, receipt_number FROM payment WHERE id = $1`,
        [paymentId],
      );
      expect(rows[0]!.status).toBe('voided');
      expect(rows[0]!.void_reason).toBe('Comprobante ilegible');
      expect(rows[0]!.voided_at).not.toBeNull();
      expect(rows[0]!.voided_by).toBeTruthy();
      expect(rows[0]!.receipt_number).toBeNull();
    });

    it('revocar el acceso deja la suscripción CANCELADA (`cancelled`)', async () => {
      const { owner, member, plan } = await setupSubscriptionFixture();
      const { subId } = await seedSubscription(owner, member, plan);

      const res = await owner.client.put(`/api/subscriptions/${subId}`, { status: 'cancelled' });
      expect(res.status, res.text).toBe(200);

      expect(await readStatus(owner, subId)).toBe('cancelled');
    });

    it('el filtro `voided` sigue al status mostrado (anulado o rechazado)', async () => {
      const { owner, member, plan } = await setupSubscriptionFixture();
      const { subId, paymentId } = await seedSubscription(owner, member, plan);
      await owner.client.patch(`/api/payments/${paymentId}/status`, { status: 'voided' });

      const res = await owner.client.get<{ data: any[] }>('/api/subscriptions', {
        query: { status: 'voided', limit: '10' },
      });
      expect(res.status, res.text).toBe(200);
      expect(res.body.data.map((r) => r.id)).toContain(subId);
    });
  });

  describe('DELETE /api/subscriptions/:id', () => {
    it('está deshabilitado: un registro financiero no se elimina', async () => {
      const { owner, member, plan } = await setupSubscriptionFixture();

      const created = await owner.client.post('/api/subscriptions', {
        memberId: member.id,
        planId: plan.id,
        startDate: isoDate(0),
        endDate: isoDate(30),
        payment: { amountPaid: 100, currencyPaid: 'USD', paymentMethod: 'cash' },
      });

      const res = await owner.client.delete(`/api/subscriptions/${created.body.id}`);
      expect(res.status, res.text).toBe(404);

      // La suscripción sigue existiendo.
      const list = await owner.client.get<{ data: any[] }>('/api/subscriptions', {
        query: { limit: '10' },
      });
      expect(list.body.data.map((r) => r.id)).toContain(created.body.id);
    });
  });

  describe('Organization isolation', () => {
    it('org A cannot see org B subscriptions', async () => {
      const tenant1 = await createGymTenant('sub-iso-a');
      const tenant2 = await createGymTenant('sub-iso-b');

      const member1 = await createGymMember(tenant1.owner.client);
      const plan1 = await createPlan(tenant1.owner.client);
      const member2 = await createGymMember(tenant2.owner.client);
      const plan2 = await createPlan(tenant2.owner.client);

      await tenant1.owner.client.post('/api/subscriptions', {
        memberId: member1.id,
        planId: plan1.id,
        startDate: isoDate(0),
        endDate: isoDate(30),
        payment: { amountPaid: 100, currencyPaid: 'USD', paymentMethod: 'cash' },
      });
      await tenant2.owner.client.post('/api/subscriptions', {
        memberId: member2.id,
        planId: plan2.id,
        startDate: isoDate(0),
        endDate: isoDate(30),
        payment: { amountPaid: 50, currencyPaid: 'USD', paymentMethod: 'cash' },
      });

      const res1 = await tenant1.owner.client.get('/api/subscriptions');
      const res2 = await tenant2.owner.client.get('/api/subscriptions');

      // Each org should only see their own subscription
      expect(res1.body.data.length).toBe(1);
      expect(res2.body.data.length).toBe(1);
    });
  });
});

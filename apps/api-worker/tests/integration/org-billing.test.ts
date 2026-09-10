/**
 * Org-scoped billing endpoints (fase 2 — renovación autoservicio).
 *
 * Covers: GET /api/organizations/subscription (detalle de la sub de la org),
 * GET /api/organizations/payment-methods (métodos de plataforma expuestos),
 * POST /api/organizations/subscription/renew (snapshot/tasa/monto dictados
 * por el backend — el body no puede hardcodear montos ni tasas), guards de
 * renovación (solo al expirar, sin pagos pendientes, no cancelada, owner/
 * manager) y el flujo de aprobación en console (PATCH status VALIDATED →
 * extiende el periodo).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { testQuery, assertSchemaReady, skipReason, truncateAll } from '../helpers/db';
import {
  registerPlatformUser,
  createGymTenant,
  addUserToOrganization,
  uid,
  isoDate,
  type AuthedUser,
} from '../helpers/auth';

async function createPlatformPlan(
  admin: AuthedUser,
  overrides: Record<string, unknown> = {},
): Promise<any> {
  const res = await admin.client.post('/api/platform/plans', {
    name: `SaaS Plan ${uid()}`,
    price: 5000,
    currency: 'USD',
    durationValue: 1,
    durationUnit: 'month',
    isActive: true,
    trialDays: 0,
    features: {
      panel: { enabled: true },
      members_portal: { enabled: true, limits: { member_seats: 5 } },
      ai_chat: { enabled: true, limits: { ai_credits_monthly: 1500 } },
    },
    ...overrides,
  });
  if (res.status !== 201) throw new Error(`create platform plan failed (${res.status}): ${res.text}`);
  return res.body;
}

async function createPlatformSubscription(
  admin: AuthedUser,
  organizationId: string,
  planId: number,
  startDateOffset = -60,
): Promise<any> {
  const res = await admin.client.post('/api/platform/subscriptions', {
    organizationId,
    planId,
    startDate: isoDate(startDateOffset),
    isTrial: false,
    payment: {
      amountPaidCents: 5000,
      currencyPaid: 'USD',
      baseAmountCents: 5000,
      paymentMethod: 'zelle',
      paymentMethodDetails: [],
      status: 'validated',
      paymentDate: isoDate(startDateOffset),
    },
  });
  if (res.status !== 201) throw new Error(`create platform subscription failed (${res.status}): ${res.text}`);
  return res.body;
}

async function latestPayment(subscriptionId: number): Promise<Record<string, any>> {
  const rows = await testQuery<Record<string, any>>(
    `SELECT * FROM platform_subscription_payment WHERE subscription_id = $1 ORDER BY id DESC LIMIT 1`,
    [subscriptionId],
  );
  return rows[0];
}

/** Mock del API de tasas (open.er-api.com) para el test cross-currency. */
function startRateServer(rates: Record<string, number>): Promise<{ url: string; server: Server }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      res.setHeader('content-type', 'application/json');
      const base = (req.url ?? '/').split('/').filter(Boolean).pop() ?? 'USD';
      res.end(JSON.stringify({ result: 'success', base_code: base, rates: { [base]: 1, ...rates } }));
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        resolve({ url: `http://127.0.0.1:${addr.port}/v6/latest`, server });
      }
    });
  });
}

describe.skipIf(skipReason !== null)('Org billing (fase 2 — renovación autoservicio)', () => {
  let admin: AuthedUser;
  let tenantA: Awaited<ReturnType<typeof createGymTenant>>;
  let tenantB: Awaited<ReturnType<typeof createGymTenant>>;
  let tenantC: Awaited<ReturnType<typeof createGymTenant>>;
  let subA: { id: number };
  let subC: { id: number };
  let rateServer: Server;

  beforeAll(async () => {
    await assertSchemaReady();
    await truncateAll();

    admin = await registerPlatformUser('admin');
    const plan = await createPlatformPlan(admin);

    // tenantA: sub expirada (para renovar)
    tenantA = await createGymTenant('renew-owner');
    subA = await createPlatformSubscription(admin, tenantA.organization.id, plan.id, -60);
    await testQuery(
      `UPDATE platform_subscription SET current_period_end = NOW() - INTERVAL '3 days' WHERE id = $1`,
      [subA.id],
    );

    // tenantB: sin suscripción
    tenantB = await createGymTenant('no-sub-owner');

    // tenantC: sub vigente (no expirada)
    tenantC = await createGymTenant('fresh-owner');
    subC = await createPlatformSubscription(admin, tenantC.organization.id, plan.id, -5);

    const { url, server } = await startRateServer({ VES: 36.5 });
    rateServer = server;
    tenantA.owner.client.env.EXCHANGE_API_URL = url;
  });

  afterAll(() => {
    rateServer?.close();
  });

  describe('GET /api/organizations/subscription', () => {
    it('rejects anonymous requests (401)', async () => {
      const res = await tenantA.owner.client.get('/api/organizations/subscription', { anonymous: true });
      expect(res.status, res.text).toBe(401);
    });

    it('returns the org subscription with plan details', async () => {
      const res = await tenantA.owner.client.get('/api/organizations/subscription');
      expect(res.status, res.text).toBe(200);
      expect(res.body.subscription).toBeDefined();
      expect(res.body.subscription.planName).toBeDefined();
      expect(res.body.subscription.planPrice).toBe(5000);
      expect(res.body.subscription.planCurrency).toBe('USD');
      expect(res.body.subscription.status).toBe('past_due');
      expect(new Date(res.body.subscription.currentPeriodEnd).getTime()).toBeLessThan(Date.now());
    });

    it('returns null subscription when the org has none', async () => {
      const res = await tenantB.owner.client.get('/api/organizations/subscription');
      expect(res.status, res.text).toBe(200);
      expect(res.body.subscription).toBeNull();
    });
  });

  describe('GET /api/organizations/payment-methods', () => {
    beforeAll(async () => {
      await admin.client.post('/api/platform/settings', {
        active_currencies: JSON.stringify(['USD', 'VES']),
        active_payment_methods: JSON.stringify([
          {
            id: 'binance',
            name: 'Binance',
            fields: [
              {
                id: 'fld_b1',
                label: 'Instrucciones',
                type: 'visual',
                required: false,
                value: 'Método de pago: Binance\nEnviar a: pagos@fitstack.app',
              },
              { id: 'fld_b2', label: 'Email remitente', type: 'text', required: true },
            ],
            currency: null,
          },
        ]),
      });
    });

    it('returns platform payment methods + currencies to the org', async () => {
      const res = await tenantA.owner.client.get('/api/organizations/payment-methods');
      expect(res.status, res.text).toBe(200);
      expect(res.body.activeCurrencies).toEqual(['USD', 'VES']);
      expect(res.body.activePaymentMethods[0].id).toBe('binance');
      expect(res.body.activePaymentMethods[0].fields[0].type).toBe('visual');
      expect(res.body.activePaymentMethods[0].fields[0].value).toContain('Binance');
      expect(res.body.currencyFormat).toBeDefined();
    });

    it('rejects anonymous requests (401)', async () => {
      const res = await tenantA.owner.client.get('/api/organizations/payment-methods', { anonymous: true });
      expect(res.status, res.text).toBe(401);
    });
  });

  describe('POST /api/organizations/subscription/renew', () => {
    it('rejects cashier without organization update permission (403)', async () => {
      const cashier = await addUserToOrganization(tenantA.organization.id, 'cashier');
      const res = await cashier.client.post('/api/organizations/subscription/renew', {
        paymentMethod: 'Binance',
        currencyPaid: 'USD',
      });
      expect(res.status, res.text).toBe(403);
    });

    it('rejects orgs without a subscription (404)', async () => {
      const res = await tenantB.owner.client.post('/api/organizations/subscription/renew', {
        paymentMethod: 'Binance',
        currencyPaid: 'USD',
      });
      expect(res.status, res.text).toBe(404);
    });

    it('rejects renewal while the subscription is still active (409)', async () => {
      const res = await tenantC.owner.client.post('/api/organizations/subscription/renew', {
        paymentMethod: 'Zelle',
        currencyPaid: 'USD',
      });
      expect(res.status, res.text).toBe(409);
      expect(res.body.error).toContain('vigente');
    });

    it('creates a processing payment from the server-side snapshot, ignoring tampered body fields', async () => {
      // Body intenta hardcodear monto, tasa y status — el backend los ignora.
      const res = await tenantA.owner.client.post('/api/organizations/subscription/renew', {
        paymentMethod: 'Binance',
        currencyPaid: 'USD',
        amountPaidCents: 1,
        status: 'validated',
        exchangeRateApplied: '0.0001',
        paymentMethodDetails: [{ label: 'Email remitente', value: 'cliente@x.com', type: 'text' }],
        paymentDate: isoDate(0),
      });

      expect(res.status, res.text).toBe(201);
      expect(res.body.paymentId).toBeDefined();

      const payment = await latestPayment(subA.id);
      expect(payment.status).toBe('processing');
      expect(Number(payment.amount_paid)).toBe(5000);
      expect(payment.currency_paid).toBe('USD');
      expect(Number(payment.base_amount)).toBe(5000);
      expect(Number(payment.exchange_rate_applied)).toBe(1);
      expect(payment.plan_snapshot_name).toBeDefined();
      expect(Number(payment.plan_snapshot_price)).toBe(5000);
      expect(payment.payment_method).toBe('Binance');

      // El periodo NO se extiende con un pago en revisión
      const sub = await testQuery<{ current_period_end: string }>(
        `SELECT current_period_end FROM platform_subscription WHERE id = $1`,
        [subA.id],
      );
      expect(new Date(sub[0].current_period_end).getTime()).toBeLessThan(Date.now());
    });

    it('rejects a second renewal while a payment is pending (409)', async () => {
      const res = await tenantA.owner.client.post('/api/organizations/subscription/renew', {
        paymentMethod: 'Zelle',
        currencyPaid: 'USD',
      });
      expect(res.status, res.text).toBe(409);
      expect(res.body.error).toContain('pendiente');
    });

    it('computes rate and amount server-side for cross-currency payments', async () => {
      // tenantB no tiene sub; reusamos tenantC: expiramos su sub (nadie renovó ahí).
      await testQuery(
        `UPDATE platform_subscription SET current_period_end = NOW() - INTERVAL '3 days' WHERE id = $1`,
        [subC.id],
      );
      tenantC.owner.client.env.EXCHANGE_API_URL = tenantA.owner.client.env.EXCHANGE_API_URL;

      const res = await tenantC.owner.client.post('/api/organizations/subscription/renew', {
        paymentMethod: 'Pago Móvil',
        currencyPaid: 'VES',
      });
      expect(res.status, res.text).toBe(201);

      const payment = await latestPayment(subC.id);
      expect(payment.status).toBe('processing');
      expect(payment.currency_paid).toBe('VES');
      expect(Number(payment.amount_paid)).toBe(Math.round(5000 * 36.5)); // 182500
      expect(Number(payment.exchange_rate_applied)).toBe(36.5);
      expect(Number(payment.base_amount)).toBe(5000);
    });

    it('approval flow: support validates the pending payment and the period extends', async () => {
      const payment = await latestPayment(subA.id);
      expect(payment.status).toBe('processing');

      const res = await admin.client.patch(`/api/platform/subscriptions/payments/${payment.id}/status`, {
        status: 'validated',
      });
      expect(res.status, res.text).toBe(200);

      const sub = await testQuery<{ current_period_end: string }>(
        `SELECT current_period_end FROM platform_subscription WHERE id = $1`,
        [subA.id],
      );
      expect(new Date(sub[0].current_period_end).getTime()).toBeGreaterThan(Date.now());

      // La org vuelve a leer su sub como activa
      const orgSub = await tenantA.owner.client.get('/api/organizations/subscription');
      expect(orgSub.status, orgSub.text).toBe(200);
      expect(orgSub.body.subscription.status).toBe('active');
    });
  });

  describe('POST /api/organizations/subscription/renew — emails', () => {
    it('enqueues email.org_payment_received with the payer from the session', async () => {
      // tenantC fue renovada en el test cross-currency (pago processing vigente);
      // para este test expiramos de nuevo y la renovamos.
      await testQuery(
        `UPDATE platform_subscription_payment SET status = 'validated' WHERE subscription_id = $1`,
        [subC.id],
      );
      await testQuery(
        `UPDATE platform_subscription SET current_period_end = NOW() - INTERVAL '3 days' WHERE id = $1`,
        [subC.id],
      );
      tenantC.owner.client.queue.reset();

      const res = await tenantC.owner.client.post('/api/organizations/subscription/renew', {
        paymentMethod: 'Zelle',
        currencyPaid: 'USD',
      });
      expect(res.status, res.text).toBe(201);

      const events = tenantC.owner.client.queue.ofType('email.org_payment_received');
      expect(events).toHaveLength(1);
      expect(events[0].paymentId).toBe(res.body.paymentId);
      expect(events[0].organizationId).toBe(tenantC.organization.id);
      expect(events[0].payerEmail).toBe(tenantC.owner.email);
      expect(String(events[0].payerName)).toBeTruthy();
    });
  });
});
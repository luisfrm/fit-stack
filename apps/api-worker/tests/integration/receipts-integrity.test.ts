/**
 * Integridad del correlativo de comprobantes (C0).
 *
 * Cubre la regresión que motivó C0: un fallo en el paso 1 DESPUÉS de consumir
 * la secuencia quemaba un correlativo → hueco permanente e inexplicado en el
 * reporte de auditoría. Y la carrera de doble emisión (dos PATCH concurrentes
 * sobre el mismo pago) debía dejar SIEMPRE un solo número persistido.
 *
 * El pago se crea como `processing` (sin emisión automática) y se valida por
 * SQL: así `POST /api/payments/:id/issue` recorre el camino real de emisión sin
 * depender de la aprobación por endpoint.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import {
  assertSchemaReady,
  skipReason,
  testQuery,
  truncateAll,
  TEST_DATABASE_URL,
} from '../helpers/db';
import {
  createGymMember,
  createGymTenant,
  createPlan,
  isoDate,
} from '../helpers/auth';
import type { createClient } from '../helpers/client';
import { createDb } from '@workspace/database/factory';
import { createReceiptsRepository } from '@workspace/database/repositories/receipts';
import { createPlatformReceiptsRepository } from '@workspace/database/repositories/platform-receipts';
import { toLocalDayString } from '@workspace/shared';

describe.skipIf(skipReason !== null)('Receipts correlative integrity (C0)', () => {
  beforeAll(async () => {
    await assertSchemaReady();
    await truncateAll();
  });

  /** Año local del emisor (mismo criterio que el paso 1). */
  function localYear(): number {
    return Number(toLocalDayString('America/Caracas', new Date()).slice(0, 4));
  }

  function receiptsRepo() {
    return createReceiptsRepository(createDb(TEST_DATABASE_URL));
  }

  function platformReceiptsRepo() {
    return createPlatformReceiptsRepository(createDb(TEST_DATABASE_URL));
  }

  /** Último número reservado de la org en el año local (0 si no hay fila). */
  async function sequenceState(orgId: string): Promise<number> {
    const rows = await testQuery<{ last_number: number }>(
      `SELECT last_number FROM organization_document_sequence
        WHERE organization_id = $1 AND document_type = 'receipt' AND year = $2`,
      [orgId, localYear()],
    );
    return Number(rows[0]?.last_number ?? 0);
  }

  /** Member + plan + pago `processing` (sin emisión automática). */
  async function createProcessingPayment(
    client: ReturnType<typeof createClient>,
  ): Promise<number> {
    const member = await createGymMember(client);
    const plan = await createPlan(client, { price: 10000, currency: 'USD' });
    const res = await client.post('/api/subscriptions', {
      memberId: member.id,
      planId: plan.id,
      startDate: isoDate(0),
      endDate: isoDate(30),
      payment: {
        amountPaid: 10000,
        currencyPaid: 'USD',
        paymentMethod: 'cash',
        paymentMethodDetails: [],
        status: 'processing',
        paymentDate: isoDate(0),
      },
    });
    expect(res.status, res.text).toBe(201);
    const rows = await testQuery<{ id: number }>(
      `SELECT id FROM payment WHERE subscription_id = $1`,
      [res.body.id],
    );
    return Number(rows[0]!.id);
  }

  /** Valida el pago por SQL (bypass del endpoint de aprobación). */
  async function markValidated(paymentId: number): Promise<void> {
    await testQuery(`UPDATE payment SET status = 'validated' WHERE id = $1`, [paymentId]);
  }

  it('releaseLastNumber libera solo si sigue siendo el último consumidor', async () => {
    const { organization } = await createGymTenant('release');
    const repo = receiptsRepo();
    const year = localYear();

    const first = await repo.nextDocumentNumber(organization.id, 'receipt', year);
    // Liberado: la secuencia vuelve atrás y el número se REUTILIZA (no se quema).
    expect(await repo.releaseLastNumber(organization.id, 'receipt', year, first)).toEqual({
      released: true,
    });
    const reused = await repo.nextDocumentNumber(organization.id, 'receipt', year);
    expect(reused).toBe(first);

    const second = await repo.nextDocumentNumber(organization.id, 'receipt', year);
    expect(second).toBe(first + 1);
    // El primero ya no es el último: retroceder reasignaría un número vivo.
    expect(await repo.releaseLastNumber(organization.id, 'receipt', year, first)).toEqual({
      released: false,
    });
    expect(await repo.releaseLastNumber(organization.id, 'receipt', year, second)).toEqual({
      released: true,
    });
    expect(await sequenceState(organization.id)).toBe(first);
  });

  it('releaseLastPlatformNumber cumple el mismo contrato en la serie global', async () => {
    const repo = platformReceiptsRepo();

    const first = await repo.nextPlatformDocumentNumber('receipt');
    expect(await repo.releaseLastPlatformNumber('receipt', first)).toEqual({
      released: true,
    });
    const reused = await repo.nextPlatformDocumentNumber('receipt');
    expect(reused).toBe(first);

    const second = await repo.nextPlatformDocumentNumber('receipt');
    expect(second).toBe(first + 1);
    expect(await repo.releaseLastPlatformNumber('receipt', first)).toEqual({
      released: false,
    });
    expect(await repo.releaseLastPlatformNumber('receipt', second)).toEqual({
      released: true,
    });
  });

  it('fallo fiscal NO quema correlativo: sin número, sin huecos', async () => {
    const { owner, organization } = await createGymTenant('fiscal-fail');
    const paymentId = await createProcessingPayment(owner.client);
    await markValidated(paymentId);

    // País fiscal desconocido → `resolveFiscalProfile` lanza (sin fallback).
    await testQuery(`UPDATE organization SET country_code = 'XX' WHERE id = $1`, [
      organization.id,
    ]);

    const res = await owner.client.post(`/api/payments/${paymentId}/issue`, {});
    expect(res.status).toBeGreaterThanOrEqual(400);

    // El punto de C0: ni un número consumido ni un hueco en la auditoría.
    expect(await sequenceState(organization.id)).toBe(0);
    const rows = await testQuery<{ receipt_number: string | null }>(
      `SELECT receipt_number FROM payment WHERE id = $1`,
      [paymentId],
    );
    expect(rows[0]!.receipt_number).toBeNull();

    const report = await owner.client.get('/api/reports/receipts', {
      query: { status: 'gaps' },
    });
    expect(report.status, report.text).toBe(200);
    expect((report.body as { gaps: unknown[] }).gaps).toEqual([]);
  });

  it('doble emisión concurrente del mismo pago → un solo número persistido', async () => {
    const { owner, organization } = await createGymTenant('race');
    const paymentId = await createProcessingPayment(owner.client);
    await markValidated(paymentId);

    const [a, b] = await Promise.all([
      owner.client.post(`/api/payments/${paymentId}/issue`, {}),
      owner.client.post(`/api/payments/${paymentId}/issue`, {}),
    ]);
    expect(a.status, a.text).toBe(200);
    expect(b.status, b.text).toBe(200);

    const rows = await testQuery<{ receipt_number: string }>(
      `SELECT receipt_number FROM payment WHERE id = $1`,
      [paymentId],
    );
    const persisted = rows[0]!.receipt_number;
    expect(persisted).toMatch(
      new RegExp(`^${organization.slug}-\\d{4}-\\d{6}$`),
    );
    // Ambos reportan el número AUTORITATIVO persistido, nunca uno local perdido.
    expect(a.body.receiptNumber).toBe(persisted);
    expect(b.body.receiptNumber).toBe(persisted);

    const numbered = await testQuery<{ count: string }>(
      `SELECT count(*)::text AS count FROM payment
        WHERE organization_id = $1 AND receipt_number IS NOT NULL`,
      [organization.id],
    );
    expect(Number(numbered[0]!.count)).toBe(1);
  });
});

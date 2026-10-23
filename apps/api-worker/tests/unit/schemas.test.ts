import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { Context } from 'hono';
import {
  VOID_REASON_REQUIRED_MESSAGE,
  paymentMethodSchema,
  requireVoidReason,
  voidReasonViolationHook,
} from '../../src/lib/schemas';

describe('paymentMethodSchema', () => {
  it('accepts valid friendly payment method names', () => {
    expect(paymentMethodSchema.safeParse('Transferencia Bancaria').success).toBe(true);
    expect(paymentMethodSchema.safeParse('Efectivo').success).toBe(true);
    expect(paymentMethodSchema.safeParse('Binance').success).toBe(true);
    expect(paymentMethodSchema.safeParse('Pago Móvil').success).toBe(true);
  });

  it('rejects empty or whitespace-only strings', () => {
    expect(paymentMethodSchema.safeParse('').success).toBe(false);
    expect(paymentMethodSchema.safeParse('   ').success).toBe(false);
  });

  it('rejects technical UUID strings', () => {
    const uuid = 'cdab3d7b-b519-4f2d-bff1-e49c4af5ff8b';
    const result = paymentMethodSchema.safeParse(uuid);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error?.issues?.[0]?.message).toContain('UUID');
    }
  });

  it('rejects strings containing a technical UUID', () => {
    const stringContainingUuid = 'method_cdab3d7b-b519-4f2d-bff1-e49c4af5ff8b';
    const result = paymentMethodSchema.safeParse(stringContainingUuid);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error?.issues?.[0]?.message).toContain('UUID');
    }
  });
});

/**
 * RD-163: the status PATCH refinement shared by Panel and Console.
 */
describe('requireVoidReason', () => {
  const schema = z
    .object({
      status: z.enum(['validated', 'voided']),
      // Same shape as the routes: no length rule of its own.
      voidReason: z.string().optional(),
    })
    .superRefine(requireVoidReason);

  it('accepts `validated` with no reason', () => {
    expect(schema.safeParse({ status: 'validated' }).success).toBe(true);
  });

  it('accepts `validated` with any leftover reason', () => {
    expect(schema.safeParse({ status: 'validated', voidReason: '' }).success).toBe(true);
  });

  it('accepts `voided` with a non-blank reason', () => {
    expect(schema.safeParse({ status: 'voided', voidReason: 'Cobro anulado' }).success).toBe(true);
  });

  it('rejects `voided` without a reason, blank or padded', () => {
    for (const payload of [
      { status: 'voided' },
      { status: 'voided', voidReason: '' },
      { status: 'voided', voidReason: '   ' },
    ]) {
      const result = schema.safeParse(payload);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.path).toEqual(['voidReason']);
      }
    }
  });
});

/**
 * RD-163: every blank-reason shape must answer the same business error
 * (resolved by `code` in the UIs), never the generic Zod envelope.
 */
describe('voidReasonViolationHook', () => {
  const schema = z
    .object({
      status: z.enum(['validated', 'voided']),
      voidReason: z.string().optional(),
    })
    .superRefine(requireVoidReason);

  const context = () =>
    ({
      json: (body: unknown, status: number) =>
        new Response(JSON.stringify(body), { status }),
    }) as unknown as Context;

  it('lets a valid payload through', () => {
    const result = schema.safeParse({ status: 'voided', voidReason: 'Cobro anulado' });
    expect(voidReasonViolationHook(result, context())).toBeUndefined();
  });

  it('maps a blank reason to 400 VOID_REASON_REQUIRED', async () => {
    for (const voidReason of ['', '   ']) {
      const result = schema.safeParse({ status: 'voided', voidReason });
      expect(result.success).toBe(false);
      const response = voidReasonViolationHook(
        { success: false, error: result.success ? undefined : result.error },
        context(),
      ) as Response;
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: VOID_REASON_REQUIRED_MESSAGE,
        code: 'VOID_REASON_REQUIRED',
        fields: ['voidReason'],
      });
    }
  });

  it('keeps the generic envelope for any other issue', async () => {
    const result = schema.safeParse({ status: 'processing' });
    expect(result.success).toBe(false);
    const response = voidReasonViolationHook(
      { success: false, error: result.success ? undefined : result.error },
      context(),
    ) as Response;
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string; code?: string };
    expect(body.error).toBe('Validación fallida');
    expect(body.code).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import { paymentMethodSchema } from '../../src/lib/schemas';

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

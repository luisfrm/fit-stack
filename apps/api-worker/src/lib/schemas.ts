import { z } from 'zod';
import { UUID_PATTERN } from '@workspace/shared';

/**
 * Canonical paymentMethod schema.
 * Rejects technical UUIDs and empty strings to prevent leaking internal IDs into receipts and invoices.
 */
export const paymentMethodSchema = z
  .string()
  .trim()
  .min(1)
  .refine(
    (v) => !UUID_PATTERN.test(v),
    { message: 'El método de pago no puede contener un identificador técnico (UUID).' },
  );

/**
 * Canonical `paymentMethodDetails` schema — the write contract is an
 * array of self-descriptive items ({ label, value, type }) as sent by
 * panel and console (see `IPaymentMethodDetails` in @workspace/shared).
 * Used by /api/subscriptions and /api/platform subscription routes.
 */
export const paymentMethodDetailsSchema = z
  .array(
    z.object({
      label: z.string(),
      value: z.string(),
      type: z.enum(['text', 'file', 'number']).optional(),
    })
  )
  .nullable()
  .optional();

/**
 * Tax line persisted in the payment. `rate` is a fraction 0–1 and amounts
 * are integer cents (see `money.ts` in `@workspace/shared`).
 * Single source of truth for PDF and reports.
 */
export const taxDetailSchema = z.object({
  name: z.string().min(1),
  rate: z.number().min(0).max(1),
  amount: z.number().int().min(0),
});

/** Org fiscal contract — re-export from shared, not duplicated. */


/**
 * Manual tax override with audit trail: requires non-empty reason.
 * Amounts in integer cents. The service also validates that Σ lines ≈
 * taxTotal (see `applyTaxOverride`).
 */
export const taxOverrideSchema = z.object({
  taxTotal: z.number().int().min(0),
  taxDetails: z.array(taxDetailSchema),
  taxOverrideReason: z.string().trim().min(1),
});

export { FiscalConfigSchema } from '@workspace/shared';
import { z } from 'zod';
import { UUID_PATTERN, isDocumentIdAllowedForCountry } from '@workspace/shared';

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
 * Org fiscal contract — re-export from shared, not duplicated.
 *
 * There is no tax write contract anymore: taxes come from `COUNTRIES` (SSOT),
 * the only fiscal switch is `isFormalTaxpayer` (Console-governed) and the
 * breakdown is always computed at emission time.
 */
export { FiscalConfigSchema } from '@workspace/shared';

/**
 * RD-148 write guard for an identification (`"<type>-<number>"`): the prefix
 * must be a `docType` of the issuer's country (`COUNTRIES` = SSOT). Returns the
 * `400` payload (business code, so the UI resolves by code) or `null` when the
 * value is acceptable. See `isDocumentIdAllowedForCountry` for the tolerance
 * rules — legacy values are never blocked by this check.
 */
export function documentIdTypeViolation(
  value: string | null | undefined,
  countryCode: string | null | undefined,
  field: string,
  /** Persisted value: resending it unchanged never blocks a legacy row. */
  currentValue?: string | null,
): { error: string; code: string; fields: string[] } | null {
  if (isDocumentIdAllowedForCountry(value, countryCode, currentValue)) return null;
  return {
    error: 'El tipo de documento no es válido para el país de la organización.',
    code: 'DOCUMENT_TYPE_INVALID',
    fields: [field],
  };
}

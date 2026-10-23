import { z } from 'zod';
import type { Context, Env } from 'hono';
import type { ZodError } from 'zod';
import { API_ERROR_CODES, UUID_PATTERN, isDocumentIdAllowedForCountry } from '@workspace/shared';

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

/** Message of the `voidReason` contract (RD-163), shared by Panel and Console. */
export const VOID_REASON_REQUIRED_MESSAGE = 'El motivo de anulación es obligatorio.';

/**
 * RD-163 refinement for the status PATCH contract: `validated` ignores the
 * reason, but a `voided` must explain itself (non-blank). Applied at the schema
 * layer (400 without touching the row) AND re-checked by the service.
 */
export function requireVoidReason(
  value: { status: string; voidReason?: string },
  ctx: z.RefinementCtx,
): void {
  if (value.status !== 'voided') return;
  if (value.voidReason?.trim()) return;
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ['voidReason'],
    message: VOID_REASON_REQUIRED_MESSAGE,
  });
}

/**
 * `zValidator` hook for the status PATCH: the `voidReason` refinement becomes
 * the stable business error (`400 VOID_REASON_REQUIRED`, resolved by code in the
 * UI) instead of the generic Zod envelope. Any other issue keeps the standard
 * `{ error: 'Validación fallida', details }` shape.
 *
 * Matched by field (`path[0] === 'voidReason'`) and not by issue code: the
 * contract answers the same `code` whether the reason arrives as an empty
 * string, as padding or not at all.
 */
export function voidReasonViolationHook<E extends Env, P extends string>(
  result: { success: boolean; error?: ZodError },
  c: Context<E, P>,
): Response | void {
  if (result.success) return;
  const issues = result.error?.issues ?? [];
  const missingReason = issues.some((issue) => issue.path[0] === 'voidReason');
  if (missingReason) {
    return c.json(
      {
        error: VOID_REASON_REQUIRED_MESSAGE,
        code: API_ERROR_CODES.VOID_REASON_REQUIRED,
        fields: ['voidReason'],
      },
      400,
    );
  }
  return c.json({ error: 'Validación fallida', details: issues }, 400);
}

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

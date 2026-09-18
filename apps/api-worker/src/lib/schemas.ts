import { z } from 'zod';
import { FiscalConfigSchema } from '@workspace/shared';

/**
 * Schema canónico de `paymentMethodDetails` — el contrato de escritura es un
 * array de items auto-descriptivos ({ label, value, type }) tal como lo envían
 * panel y console (ver `IPaymentMethodDetails` en @workspace/shared).
 * Usado por /api/subscriptions y las rutas de suscripción de /api/platform.
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
 * Línea de impuesto persistida en el pago. `rate` es fracción 0–1 y los
 * montos son centavos enteros (ver `money.ts` en `@workspace/shared`).
 * Única fuente de verdad para PDF y reportes.
 */
export const taxDetailSchema = z.object({
  name: z.string().min(1),
  rate: z.number().min(0).max(1),
  amount: z.number().int().min(0),
});

/** Contrato fiscal de la org — re-export del de shared, no duplicado. */
export { FiscalConfigSchema };

/**
 * Override manual de impuestos con auditoría: exige motivo no vacío.
 * Montos en centavos enteros. El servicio valida además que Σ líneas ≈
 * taxTotal (ver `applyTaxOverride`).
 */
export const taxOverrideSchema = z.object({
  taxTotal: z.number().int().min(0),
  taxDetails: z.array(taxDetailSchema),
  taxOverrideReason: z.string().trim().min(1),
});

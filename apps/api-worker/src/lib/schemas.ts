import { z } from 'zod';
import { FiscalConfigSchema, TaxDetailSchema } from '@workspace/shared';

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

/** Desglose de impuestos de un pago (espejo de `ITaxDetail`). */
export const taxDetailSchema = TaxDetailSchema;

/** Configuración fiscal de la organización (single source of truth en @workspace/shared). */
export const fiscalConfigSchema = FiscalConfigSchema;

/** Override manual de impuestos: exige motivo (auditoría). */
export const taxOverrideSchema = z.object({
  taxOverrideReason: z.string().min(1),
  taxTotal: z.number().nonnegative().optional(),
  taxDetails: z.array(taxDetailSchema).optional(),
});

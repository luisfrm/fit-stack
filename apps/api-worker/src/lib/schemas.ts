import { z } from 'zod';

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

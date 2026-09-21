/**
 * Compensación explícita del alta cuando falla la emisión del comprobante
 * (FS-0002, fase 2 — B3.1 panel, reutilizable en SaaS fase 3).
 *
 * Sin transacciones interactivas (driver HTTP de Neon): el servicio commitea
 * en 3 pasos (`subsRepo.create` → `paymentsRepo.create` → paso 1) y compensa
 * en el `catch` delegando aquí. La decisión es **por relectura**, nunca por
 * tipo de error: si el número quedó persistido, el alta es un éxito
 * (`'committed'`); si no, se anula el pago o se cancela la huérfana
 * (`'compensated'` + el servicio re-lanza el original para que `onError`
 * traduzca el código).
 *
 * Sin dependencias de repos concretos (solo closures): el caller cablea
 * `paymentsRepo.findById` / `paymentsRepo.updateStatus` / `subsRepo.cancel`.
 */
export type CompensationOutcome = 'committed' | 'compensated' | 'unresolved';

export interface CompensationClosures {
  readPayment: () => Promise<{ receiptNumber?: string | null } | undefined | null>;
  voidPayment: () => Promise<unknown>;
  cancelParent?: () => Promise<unknown>;
  /**
   * Revierte un efecto ya persistido del intento fallido (p. ej. el
   * `currentPeriodEnd` extendido en SaaS). Corre solo cuando la anulación del
   * pago fue **efectiva**, nunca en `committed` (si el comprobante se emitió el
   * alta es válida) ni en `unresolved` (no se decidió nada). Si la anulación
   * falla el cobro sigue válido y el efecto debe conservarse: reverir el
   * periodo dejaría un cobro sin servicio (Regla 4).
   */
  revertEffect?: () => Promise<unknown>;
}

export interface CompensationOptions {
  paymentCreated: boolean;
}

/**
 * Motivo fijo de la anulación compensatoria. Se persiste en
 * `voided_by`/`void_reason` del pago (auditoría de anulación): el pago queda
 * `voided` — no da acceso, no cuenta como cobro y **no bloquea el reintento**
 * (el guard solo frena `processing`).
 */
export const COMPENSATION_VOID_REASON = 'Compensación: fallo al emitir el comprobante';

/**
 * Reintentos acotados de la relectura. Un blip del driver HTTP de Neon es
 * transitorio: un puñado de intentos cortos evita decidir sobre una lectura
 * fallida.
 */
const READ_ATTEMPTS = 3;
const READ_BACKOFF_MS = [50, 150];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function readPaymentWithRetry(
  readPayment: CompensationClosures['readPayment'],
): Promise<{ receiptNumber?: string | null } | undefined | null> {
  let lastError: unknown;
  for (let attempt = 0; attempt < READ_ATTEMPTS; attempt++) {
    try {
      return await readPayment();
    } catch (error) {
      lastError = error;
      if (attempt < READ_ATTEMPTS - 1) await sleep(READ_BACKOFF_MS[attempt] ?? 150);
    }
  }
  throw lastError;
}

export async function compensateFailedEmission(
  originalError: unknown,
  closures: CompensationClosures,
  opts: CompensationOptions,
): Promise<CompensationOutcome> {
  if (opts.paymentCreated) {
    let persisted: { receiptNumber?: string | null } | undefined | null = null;
    try {
      persisted = await readPaymentWithRetry(closures.readPayment);
    } catch (readError) {
      // La relectura falló tras los reintentos (blip persistente): NO se puede
      // saber si el número quedó persistido, y anular a ciegas destruiría un
      // comprobante legítimamente emitido (y, en SaaS, revertiría el periodo).
      // Fail-closed real: no se toca nada; el servicio re-lanza el original y
      // el barrido (predicado 1) recupera el render si el número sí commiteó.
      // Se deja marcador de reconciliación para operación.
      console.error('[subscription-compensation] relectura no resuelta: no se compensa', {
        readError,
        originalError,
      });
      return 'unresolved';
    }
    if (persisted?.receiptNumber) {
      // El número se commiteó antes del fallo (o un reintento idempotente lo
      // completó): no se compensa ni se re-lanza. Re-lanzar aquí provocaría
      // el doble cobro que se evita. El render pendiente lo recupera el
      // predicado 1 del barrido (≤15 min).
      return 'committed';
    }
    // La anulación manda: el revert del periodo solo corre si el pago quedó
    // efectivamente anulado (si no, el cobro sigue válido y el efecto se
    // conserva).
    const voided = await compensate(originalError, 'void', closures.voidPayment);
    if (voided) {
      await compensate(originalError, 'revert', closures.revertEffect);
    }
    return 'compensated';
  }

  // Falló `paymentsRepo.create`: la suscripción quedó huérfana sin pago.
  // Se cancela, nunca se borra (regla 6: registro financiero inmutable).
  await compensate(originalError, 'cancel', closures.cancelParent);
  return 'compensated';
}

/**
 * Ejecuta la compensación sin enmascarar el error original: si la propia
 * escritura compensatoria falla, se registra y el servicio re-lanza el error
 * de emisión (el `code` del contrato), nunca el de la compensación.
 *
 * Devuelve `true` si la escritura se ejecutó y no lanzó. Un cierre ausente
 * devuelve `true` (no había nada que deshacer). El revert del periodo se gatea
 * con este resultado para no dejar un cobro válido sin servicio.
 */
async function compensate(
  originalError: unknown,
  action: 'void' | 'cancel' | 'revert',
  write?: () => Promise<unknown>,
): Promise<boolean> {
  if (!write) return true;
  try {
    await write();
    return true;
  } catch (compensationError) {
    const label = {
      void: 'la anulación del pago',
      cancel: 'el cancel de la huérfana',
      revert: 'la reversión del efecto',
    }[action];
    console.error(`[subscription-compensation] falló ${label}`, {
      compensationError,
      originalError,
    });
    return false;
  }
}

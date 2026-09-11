/* ── Documents / money — unidades monetarias ───────────────────────────
   Convención de Fase 0 (verificada contra el schema Drizzle):
   - El pago del gym (`payment.amountPaid`, `numeric`) viaja en UNIDADES
     MAYORES con 2 decimales — NO en centavos.
   - El pago SaaS (`platform_subscription_payment.amountPaid`, `bigint`)
     viaja en CENTAVOS.
   Todo el motor fiscal (`tax-math`, `receipt-data`) opera en unidades
   mayores. Los callers con centavos convierten en la frontera con estos
   helpers puros. Funciones puras, sin I/O, edge-safe (Workers).
   ─────────────────────────────────────────────────────────────────────── */

/** Convierte centavos enteros a unidades mayores (199 → 1.99). */
export function centsToUnits(cents: number): number {
  if (!Number.isFinite(cents)) {
    throw new Error(`centsToUnits: monto inválido (${String(cents)})`);
  }
  return cents / 100;
}

/**
 * Convierte unidades mayores a centavos enteros (1.99 → 199).
 * Redondea half-up al centavo más cercano.
 */
export function unitsToCents(units: number): number {
  if (!Number.isFinite(units)) {
    throw new Error(`unitsToCents: monto inválido (${String(units)})`);
  }
  return Math.round((units + Number.EPSILON) * 100);
}

/* ── Documents / money — unidades monetarias ───────────────────────────
   Convención del proyecto (verificada contra el schema Drizzle y los
   contratos de API/E2E): TODO monto de pago y precio viaja y se guarda en
   CENTAVOS ENTEROS (`bigint` en DB, `int` en contratos).
   Estos helpers solo existen para la frontera con display/inputs en
   unidades mayores (formularios que editan "50.00" y muestran con
   `formatCents`). El motor fiscal (`tax-math`, `receipt-data`) opera
   siempre en centavos enteros.
   Funciones puras, sin I/O, edge-safe (Workers).
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

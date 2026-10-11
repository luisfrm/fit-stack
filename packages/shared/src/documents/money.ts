/* ── Documents / money — monetary units ─────────────────────────────────
   Project convention (verified against Drizzle schema and API/E2E contracts):
   EVERY payment amount and price travels and persists in
   INTEGER CENTS (`bigint` in DB, `int` in contracts).
   These helpers exist solely at the boundary with display/inputs in
   major units (forms editing "50.00" and displaying with `formatCents`).
   The fiscal engine (`tax-math`, `receipt-data`) always operates in integer cents.
   Pure functions, no I/O, edge-safe (Workers).
   ─────────────────────────────────────────────────────────────────────── */

/** Converts integer cents to major units (199 → 1.99). */
export function centsToUnits(cents: number): number {
  if (!Number.isFinite(cents)) {
    throw new Error(`centsToUnits: monto inválido (${String(cents)})`);
  }
  return cents / 100;
}

/**
 * Converts major units to integer cents (1.99 → 199).
 * Rounds half-up to nearest cent.
 */
export function unitsToCents(units: number): number {
  if (!Number.isFinite(units)) {
    throw new Error(`unitsToCents: monto inválido (${String(units)})`);
  }
  return Math.round((units + Number.EPSILON) * 100);
}

/* ── Formatting module — display de valores, fuente única ───────────────
   Re-exporta formateo de moneda/fechas. La conversión centavos↔unidades
   vive en `documents/money.ts` (implementación única, no duplicada aquí).
   ─────────────────────────────────────────────────────────────────────── */

export * from './currency';
export { centsToUnits, unitsToCents } from '../documents/money';

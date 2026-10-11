/* ── Formatting module — value display, single source of truth ──────────
   Re-exports currency and date formatting. Cents↔units conversion
   lives in `documents/money.ts` (single implementation, not duplicated here).
   ─────────────────────────────────────────────────────────────────────── */

export * from './currency';
export { centsToUnits, unitsToCents } from '../documents/money';

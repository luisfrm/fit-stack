/* ── Documents module — fiscal & documentary rules engine ──────────────
   Single origin for: document label gate, fiscal profile, tax math,
   monetary unit conversion, correlative numbers, masking, and ReceiptData contract.
   Pure functions, no DB, no Workers. Re-exported by `@workspace/shared`.
   ─────────────────────────────────────────────────────────────────────── */

export * from './document-label-gate';
export * from './fiscal-profile';
export * from './tax-math';
export * from './money';
export * from './receipt-number';
export * from './masking';
export * from './receipt-data';
export * from './receipt-events';
export * from './receipt-storage-keys';
export * from './receipt-compose';
export * from './receipt-composer';
export * from './receipt-gaps';

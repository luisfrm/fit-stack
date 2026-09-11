/* ── Documents module — motor de reglas fiscales/documentales ───────────
   Único origen de: gate de etiqueta, perfil fiscal, cálculo de impuestos,
   conversión de unidades, correlativos, enmascarado y contrato ReceiptData.
   Puro, sin DB, sin Workers. Re-exportado por `@workspace/shared`.
   ─────────────────────────────────────────────────────────────────────── */

export * from './document-label-gate';
export * from './fiscal-profile';
export * from './tax-math';
export * from './money';
export * from './receipt-number';
export * from './masking';
export * from './receipt-data';

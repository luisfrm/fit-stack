/**
 * Receipt correlative text patterns used by the E2E assertions.
 *
 * The shapes mirror `@workspace/shared/documents/receipt-number` (single
 * source of truth for the numbering math); the specs only assert what a human
 * sees, never the technical payment id.
 */

/**
 * Panel correlative: `{year}-{seq:06d}` → `2026-000045`.
 *
 * The organization slug is NOT part of the number (RD-119): each organization
 * owns its own per-year sequence. The legacy `{slug}-{year}-{seq}` shape is
 * still PARSED (an issued number is immutable) but never rendered, so the
 * specs must not expect it.
 */
export const PANEL_RECEIPT_NUMBER_PATTERN = /20\d{2}-\d{6,}/;

/** Console correlative: `FS-{seq:07d}` → `FS-0000045` (global sequence). */
export const CONSOLE_RECEIPT_NUMBER_PATTERN = /FS-\d{7,}/;

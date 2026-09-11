/* ── Documents / receipt-number — formato de correlativos ──────────────
   Dos secuencias, dos emisores legales distintos:
   - Panel (cada gym es su propio emisor): `{slug}-{año}-{seq:06d}`.
   - Console (FitStack, emisor único): `FS-{seq:07d}` (continua, sin año).
   El año VIENE resuelto por el caller (año local del emisor vía
   `requireOrgTimezone()` en Fase 1/2) — este módulo no toca fechas.
   Funciones puras, sin I/O, edge-safe (Workers).
   ─────────────────────────────────────────────────────────────────────── */

export const PANEL_RECEIPT_PAD = 6;
export const CONSOLE_RECEIPT_PAD = 7;
export const MIN_RECEIPT_YEAR = 2000;
export const MAX_RECEIPT_YEAR = 2100;

const PANEL_SLUG_PATTERN = /^[a-z0-9-]+$/;
const PANEL_RECEIPT_PATTERN = /^([a-z0-9-]+)-(\d{4})-(\d{6,})$/;
const CONSOLE_RECEIPT_PATTERN = /^FS-(\d{7,})$/;

function normalizeSlug(slug: string): string {
  const normalized = slug.trim().toLowerCase();
  if (normalized.length === 0 || !PANEL_SLUG_PATTERN.test(normalized)) {
    throw new Error(
      `formatPanelReceiptNumber: slug inválido ("${slug}"). Solo [a-z0-9-].`,
    );
  }
  return normalized;
}

function assertYear(year: number): void {
  if (!Number.isInteger(year) || year < MIN_RECEIPT_YEAR || year > MAX_RECEIPT_YEAR) {
    throw new Error(
      `formatPanelReceiptNumber: año inválido (${String(year)}). Rango ${MIN_RECEIPT_YEAR}-${MAX_RECEIPT_YEAR}.`,
    );
  }
}

function assertSeq(seq: number): void {
  if (!Number.isInteger(seq) || seq < 1) {
    throw new Error(`Número correlativo inválido (${String(seq)}). Debe ser entero ≥ 1.`);
  }
}

/** `{slug}-2026-000045`. Nunca incluye el `organization.id` completo. */
export function formatPanelReceiptNumber(slug: string, year: number, seq: number): string {
  const cleanSlug = normalizeSlug(slug);
  assertYear(year);
  assertSeq(seq);
  return `${cleanSlug}-${year}-${String(seq).padStart(PANEL_RECEIPT_PAD, '0')}`;
}

/** `FS-0000001`. Secuencia global continua, sin año. */
export function formatConsoleReceiptNumber(seq: number): string {
  assertSeq(seq);
  return `FS-${String(seq).padStart(CONSOLE_RECEIPT_PAD, '0')}`;
}

export interface ParsedPanelReceiptNumber {
  slug: string;
  year: number;
  seq: number;
}

/** Parse estricto; `null` si el formato no es de Panel (no lanza). */
export function parsePanelReceiptNumber(value: string): ParsedPanelReceiptNumber | null {
  const match = PANEL_RECEIPT_PATTERN.exec(value.trim());
  if (!match) return null;
  const year = Number(match[2]);
  if (year < MIN_RECEIPT_YEAR || year > MAX_RECEIPT_YEAR) return null;
  return { slug: match[1] as string, year, seq: Number(match[3]) };
}

/** Parse estricto; `null` si el formato no es de Console (no lanza). */
export function parseConsoleReceiptNumber(value: string): number | null {
  const match = CONSOLE_RECEIPT_PATTERN.exec(value.trim());
  if (!match) return null;
  return Number(match[1]);
}

/** `true` si `value` es un correlativo Panel válido. */
export function isValidPanelReceiptNumber(value: string): boolean {
  return parsePanelReceiptNumber(value) !== null;
}

/** `true` si `value` es un correlativo Console válido. */
export function isValidConsoleReceiptNumber(value: string): boolean {
  return parseConsoleReceiptNumber(value) !== null;
}

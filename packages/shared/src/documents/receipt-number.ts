/**
 * Numeración humana de comprobantes.
 *
 * Dos emisores legales distintos → dos secuencias distintas:
 * - Panel: cada gym es un emisor; numeración POR ORGANIZACIÓN + año.
 *   Formato `{slug}-{año}-{secuencia}` (ej. `mi-gym-2026-000045`).
 * - Console: FitStack es un único emisor global.
 *   Formato `FS-{secuencia}` (ej. `FS-0000001`).
 *
 * El UUID del pago nunca se usa como número: es clave técnica interna.
 */

export const PANEL_RECEIPT_SEQUENCE_PAD = 6;
export const CONSOLE_RECEIPT_SEQUENCE_PAD = 7;
export const CONSOLE_RECEIPT_PREFIX = 'FS';

const PANEL_PATTERN = /^([a-z0-9][a-z0-9-]*)-(\d{4})-(\d{6,})$/;
const CONSOLE_PATTERN = /^FS-(\d{7,})$/;

export interface ParsedPanelReceiptNumber {
  slug: string;
  year: number;
  sequence: number;
}

export interface ParsedConsoleReceiptNumber {
  sequence: number;
}

/** `formatPanelReceiptNumber('mi-gym', 2026, 45)` → `mi-gym-2026-000045`. */
export function formatPanelReceiptNumber(slug: string, year: number, sequence: number): string {
  const cleanSlug = slug.trim().toLowerCase();
  if (!cleanSlug) {
    throw new Error('El slug de la organización es requerido para numerar el comprobante.');
  }
  if (!Number.isInteger(year) || year < 1000 || year > 9999) {
    throw new Error(`Año inválido para numeración de comprobante: ${year}`);
  }
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error(`Secuencia de comprobante inválida: ${sequence}`);
  }
  return `${cleanSlug}-${year}-${String(sequence).padStart(PANEL_RECEIPT_SEQUENCE_PAD, '0')}`;
}

export function parsePanelReceiptNumber(value: string): ParsedPanelReceiptNumber | null {
  const match = PANEL_PATTERN.exec(value.trim());
  if (!match) return null;

  const [, slug, year, sequence] = match;
  if (!slug || !year || !sequence) return null;

  return { slug, year: Number(year), sequence: Number(sequence) };
}

export function isPanelReceiptNumber(value: string): boolean {
  return parsePanelReceiptNumber(value) !== null;
}

/** `formatConsoleReceiptNumber(1)` → `FS-0000001`. */
export function formatConsoleReceiptNumber(sequence: number): string {
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error(`Secuencia de comprobante inválida: ${sequence}`);
  }
  return `${CONSOLE_RECEIPT_PREFIX}-${String(sequence).padStart(CONSOLE_RECEIPT_SEQUENCE_PAD, '0')}`;
}

export function parseConsoleReceiptNumber(value: string): ParsedConsoleReceiptNumber | null {
  const match = CONSOLE_PATTERN.exec(value.trim());
  if (!match) return null;

  const sequence = match[1];
  if (!sequence) return null;

  return { sequence: Number(sequence) };
}

export function isConsoleReceiptNumber(value: string): boolean {
  return parseConsoleReceiptNumber(value) !== null;
}

/** ¿Es un número de comprobante válido (Panel o Console)? */
export function isReceiptNumber(value: string): boolean {
  return isPanelReceiptNumber(value) || isConsoleReceiptNumber(value);
}

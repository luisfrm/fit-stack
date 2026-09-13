/* ── Documents / receipt-gaps — auditoría del correlativo ───────────────
    Regla congelada (plan.md): un número ausente en la secuencia es un
    "hueco" sospechoso; un número presente con `receipt_voided` es un
    "anulado" explicado. Nunca se tratan igual y nunca se libera ni reusa
    un número. Puro, sin I/O, edge-safe (Workers).
    ─────────────────────────────────────────────────────────────────────── */

import {
  formatPanelReceiptNumber,
  parsePanelReceiptNumber,
} from './receipt-number';

/** Clasificación de un faltante/explicado en el correlativo. */
export type ReceiptGapKind = 'hueco' | 'anulado';

export interface ReceiptGapEntry {
  /** Secuencia dentro del año (1..lastNumber). */
  seq: number;
  /** `true` = número conservado pero anulado (explicado). */
  voided: boolean;
  voidedBy?: string | null;
  voidedAt?: string | Date | null;
  voidReason?: string | null;
}

export interface ReceiptGapItem {
  kind: ReceiptGapKind;
  seq: number;
  /** Número humano (`{slug}-{año}-{seq}`). Nunca el UUID del pago. */
  receiptNumber: string;
  voidedBy?: string | null;
  /** ISO. Solo en `anulado`. */
  voidedAt?: string | null;
  voidReason?: string | null;
}

export interface ComputeReceiptGapsInput {
  year: number;
  /** Slug del emisor (parte del número humano). */
  slug: string;
  /** Último número reservado en `organization_document_sequence`. */
  lastNumber: number;
  /** Números presentes (emitidos o anulados). */
  entries: ReceiptGapEntry[];
}

function toIsoOrNull(value: string | Date | null | undefined, seq: number): string | null {
  if (value === null || value === undefined) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`computeReceiptGaps: voidedAt inválida en seq ${seq}.`);
  }
  return d.toISOString();
}

/**
 * Calcula los faltantes del correlativo anual contra `1..lastNumber`.
 * Los emitidos no aparecen en el resultado; los ausentes son `hueco` y los
 * presentes-anulados son `anulado`. Lanza ante datos incoherentes (nunca
 * silencia un correlativo roto).
 */
export function computeReceiptGaps(input: ComputeReceiptGapsInput): ReceiptGapItem[] {
  const { year, slug, lastNumber, entries } = input;
  if (!Number.isInteger(lastNumber) || lastNumber < 0) {
    throw new Error(
      `computeReceiptGaps: lastNumber inválido (${String(lastNumber)}). Debe ser entero ≥ 0.`,
    );
  }

  const bySeq = new Map<number, ReceiptGapEntry>();
  for (const entry of entries) {
    if (!Number.isInteger(entry.seq) || entry.seq < 1 || entry.seq > lastNumber) {
      throw new Error(
        `computeReceiptGaps: seq fuera del universo 1..${lastNumber} (${String(entry.seq)}).`,
      );
    }
    if (bySeq.has(entry.seq)) {
      throw new Error(`computeReceiptGaps: seq duplicado (${entry.seq}).`);
    }
    bySeq.set(entry.seq, entry);
  }

  const gaps: ReceiptGapItem[] = [];
  for (let seq = 1; seq <= lastNumber; seq += 1) {
    const receiptNumber = formatPanelReceiptNumber(slug, year, seq);
    // Coherencia número↔secuencia: el formateado debe parsear al mismo seq.
    const parsed = parsePanelReceiptNumber(receiptNumber);
    if (!parsed || parsed.seq !== seq || parsed.year !== year) {
      throw new Error(`computeReceiptGaps: número incoherente para seq ${seq}.`);
    }
    const entry = bySeq.get(seq);
    if (!entry) {
      gaps.push({ kind: 'hueco', seq, receiptNumber });
    } else if (entry.voided) {
      gaps.push({
        kind: 'anulado',
        seq,
        receiptNumber,
        voidedBy: entry.voidedBy ?? null,
        voidedAt: toIsoOrNull(entry.voidedAt, seq),
        voidReason: entry.voidReason ?? null,
      });
    }
  }
  return gaps;
}

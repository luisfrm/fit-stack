/* ── Documents / receipt-gaps — auditoría del correlativo ───────────────
    Regla congelada (plan.md): un número ausente en la secuencia es un
    "hueco" sospechoso; un número presente con `receipt_voided` es un
    "anulado" explicado. Nunca se tratan igual y nunca se libera ni reusa
    un número.
    Dos series, dos emisores legales: Panel (`{slug}-{año}-{seq}`, anual por
    organización) y Console (`FS-{seq}`, global continua). La única
    diferencia es el formato del número, así que vive en una estrategia
    inyectada; aquí queda solo el algoritmo.
    Puro, sin I/O, edge-safe (Workers).
    ─────────────────────────────────────────────────────────────────────── */

import {
  formatConsoleReceiptNumber,
  formatPanelReceiptNumber,
  parseConsoleReceiptNumber,
  parsePanelReceiptNumber,
} from './receipt-number';

/** Clasificación de un faltante/explicado en el correlativo. */
export type ReceiptGapKind = 'hueco' | 'anulado';

export interface ReceiptGapEntry {
  /** Secuencia dentro del universo auditado (1..lastNumber). */
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
  /** Número humano del emisor. Nunca el UUID del pago. */
  receiptNumber: string;
  voidedBy?: string | null;
  /** ISO. Solo en `anulado`. */
  voidedAt?: string | null;
  voidReason?: string | null;
}

/** Formato y parse de UNA serie: el número humano y su seq. */
export interface ReceiptGapStrategy {
  /** Número humano del `seq` (1-based). Lanza si el seq es inválido. */
  format(seq: number): string;
  /** `seq` del número, o `null` si no pertenece a esta serie. */
  parse(receiptNumber: string): number | null;
}

export interface ComputeReceiptGapsInput {
  /** Último número reservado: universo auditado = `1..lastNumber`. */
  lastNumber: number;
  /** Números presentes (emitidos o anulados) del universo auditado. */
  entries: ReceiptGapEntry[];
  strategy: ReceiptGapStrategy;
}

/** Serie del Panel: anual por organización (`{slug}-{año}-{seq}`). */
export interface PanelReceiptGapsInput {
  year: number;
  /** Slug del emisor (parte del número humano). */
  slug: string;
  lastNumber: number;
  entries: ReceiptGapEntry[];
}

/** Serie de Console: global continua, sin año (`FS-{seq}`). */
export interface ConsoleReceiptGapsInput {
  lastNumber: number;
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
 * Calcula los faltantes del correlativo contra `1..lastNumber`.
 * Los emitidos no aparecen en el resultado; los ausentes son `hueco` y los
 * presentes-anulados son `anulado`. Lanza ante datos incoherentes (nunca
 * silencia un correlativo roto).
 */
export function computeReceiptGaps(input: ComputeReceiptGapsInput): ReceiptGapItem[] {
  const { lastNumber, entries, strategy } = input;
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
    const receiptNumber = strategy.format(seq);
    // Coherencia número↔secuencia: el formateado debe parsear al mismo seq
    // (detecta una serie corrupta antes de reportarla como hueco).
    if (strategy.parse(receiptNumber) !== seq) {
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

/**
 * Gaps de la serie del Panel (anual, por organización). El slug se normaliza
 * como lo hace el formato para que el parse de coherencia coincida.
 */
export function computePanelReceiptGaps(input: PanelReceiptGapsInput): ReceiptGapItem[] {
  const slug = input.slug.trim().toLowerCase();
  return computeReceiptGaps({
    lastNumber: input.lastNumber,
    entries: input.entries,
    strategy: {
      format: (seq) => formatPanelReceiptNumber(slug, input.year, seq),
      parse: (receiptNumber) => {
        const parsed = parsePanelReceiptNumber(receiptNumber);
        if (!parsed || parsed.year !== input.year || parsed.slug !== slug) return null;
        return parsed.seq;
      },
    },
  });
}

/** Gaps de la serie de Console (global continua, un solo emisor: FitStack). */
export function computeConsoleReceiptGaps(input: ConsoleReceiptGapsInput): ReceiptGapItem[] {
  return computeReceiptGaps({
    lastNumber: input.lastNumber,
    entries: input.entries,
    strategy: {
      format: (seq) => formatConsoleReceiptNumber(seq),
      parse: (receiptNumber) => parseConsoleReceiptNumber(receiptNumber),
    },
  });
}

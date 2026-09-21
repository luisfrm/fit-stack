import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
  type RGB,
} from 'pdf-lib';
import {
  formatCents,
  type CurrencyFormat,
  type ReceiptData,
} from '@workspace/shared';

/* ── Receipt PDF render (pdf-lib, workerd-safe) ──────────────────────────
   Motor de render del comprobante con `pdf-lib` (JS puro, sin WASM): cabe
   en UNA sola página A4 con todo el contenido del documento. Todo texto de
   usuario se sanitiza al charset WinAnsi de la fuente embebida; sin dato la
   línea se OMITE (jamás el placeholder `---`, lo prohíbe `checklistPrePdf`).
   ─────────────────────────────────────────────────────────────────────── */

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 40;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const RIGHT_EDGE = PAGE_WIDTH - MARGIN;
const BOTTOM_LIMIT = MARGIN;

const INK = rgb(0.1, 0.1, 0.1);
const MUTED = rgb(0.4, 0.4, 0.4);
const FAINT = rgb(0.6, 0.6, 0.6);
const LIGHT_RULE = rgb(0.94, 0.94, 0.94);
const VOID_RED = rgb(0.725, 0.11, 0.11);

function formatDateEs(iso: string, timezone: string | undefined): string {
  // Fecha en hora LOCAL del emisor (un pago a las 23h cae en el mismo día).
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    ...(timezone ? { timeZone: timezone } : {}),
  }).format(new Date(iso));
}

interface RenderCtx {
  page: PDFPage;
  regular: PDFFont;
  bold: PDFFont;
  supported: Set<number>;
  y: number;
}

type Align = 'left' | 'right' | 'center';

/** Conserva solo los code points que la fuente puede representar (WinAnsi). */
function sanitize(text: string, supported: Set<number>): string {
  let out = '';
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp !== undefined && supported.has(cp)) out += ch;
  }
  return out;
}

function measure(font: PDFFont, size: number, text: string): number {
  return font.widthOfTextAtSize(text, size);
}

/** Trunca un token irrompible con elipsis para garantizar la página única. */
function truncateToken(
  token: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
  supported: Set<number>,
): string {
  const ELLIPSIS = '…';
  let out = '';
  for (const ch of token) {
    const candidate = out + ch;
    if (
      measure(font, size, sanitize(candidate + ELLIPSIS, supported)) > maxWidth
    ) {
      break;
    }
    out = candidate;
  }
  return sanitize(out + ELLIPSIS, supported);
}

/** Envuelve un texto en líneas que caben en `maxWidth`. */
function wrapLines(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
  supported: Set<number>,
): string[] {
  const clean = sanitize(text, supported);
  if (clean.length === 0) return [];
  if (measure(font, size, clean) <= maxWidth) return [clean];
  const lines: string[] = [];
  let current = '';
  for (const word of clean.split(' ')) {
    if (word.length === 0) continue;
    const wordWidth = measure(font, size, word);
    if (wordWidth > maxWidth) {
      if (current.length > 0) {
        lines.push(current);
        current = '';
      }
      lines.push(truncateToken(word, font, size, maxWidth, supported));
      continue;
    }
    const candidate = current.length > 0 ? `${current} ${word}` : word;
    if (measure(font, size, candidate) <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
}

interface LineOpts {
  size: number;
  font?: PDFFont;
  color?: RGB;
  align?: Align;
  x?: number;
  maxWidth?: number;
  /** Espacio bajo la línea (default: 30 % del tamaño). */
  gapAfter?: number;
}

/**
 * Dibuja un texto (con wrap) y avanza el cursor. Si ya no hay espacio
 * vertical, la línea se descarta: el documento siempre es una sola página.
 */
function drawLine(ctx: RenderCtx, text: string, opts: LineOpts): void {
  const font = opts.font ?? ctx.regular;
  const color = opts.color ?? INK;
  const align = opts.align ?? 'left';
  const x0 = opts.x ?? MARGIN;
  const maxWidth = opts.maxWidth ?? RIGHT_EDGE - x0;
  const gapAfter = opts.gapAfter ?? opts.size * 0.3;
  for (const line of wrapLines(text, font, opts.size, maxWidth, ctx.supported)) {
    const lineHeight = opts.size * 1.4;
    if (ctx.y - lineHeight < BOTTOM_LIMIT) return;
    const width = measure(font, opts.size, line);
    const x =
      align === 'right'
        ? x0 + maxWidth - width
        : align === 'center'
          ? x0 + (maxWidth - width) / 2
          : x0;
    ctx.page.drawText(line, { x, y: ctx.y - lineHeight, size: opts.size, font, color });
    ctx.y -= lineHeight + gapAfter;
  }
}

function drawRule(
  ctx: RenderCtx,
  opts: { thickness?: number; color?: RGB; gapBefore?: number; gapAfter?: number } = {},
): void {
  const thickness = opts.thickness ?? 1;
  const color = opts.color ?? LIGHT_RULE;
  ctx.y -= opts.gapBefore ?? 6;
  if (ctx.y < BOTTOM_LIMIT) return;
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y },
    end: { x: RIGHT_EDGE, y: ctx.y },
    thickness,
    color,
  });
  ctx.y -= (opts.gapAfter ?? 10) + thickness;
}

function spacer(ctx: RenderCtx, points: number): void {
  ctx.y -= points;
}

/**
 * Renderiza el PDF del comprobante. Usado SOLO por el consumer del paso 2
 * (`handleReceiptRender`), nunca en un request. Import lazy del motor para
 * no engordar el bundle del path de emails.
 */
export async function renderReceiptPdfBytes(
  data: ReceiptData,
  format: CurrencyFormat = 'latam',
): Promise<Uint8Array> {
  const { emitter, recipient, document, sale, amounts, method, footer, timezone, voided } =
    data;
  const baseCurrency = amounts.baseCurrency ?? emitter.currency;
  // La conversión solo se muestra si el pago NO está en la moneda base y la
  // tasa persistida existe (FACTURATION.md §3).
  const showConversion =
    amounts.currencyPaid !== baseCurrency && Boolean(amounts.exchangeRateApplied);

  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const supported = new Set<number>([
    ...regular.getCharacterSet(),
    ...bold.getCharacterSet(),
  ]);
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const ctx: RenderCtx = { page, regular, bold, supported, y: PAGE_HEIGHT - MARGIN };

  /* Cabecera: emisor a la izquierda, documento a la derecha. */
  const headerTop = ctx.y;
  drawLine(ctx, (emitter.legalName || emitter.name).toUpperCase(), {
    size: 14,
    font: bold,
    maxWidth: CONTENT_WIDTH * 0.58,
    gapAfter: 2,
  });
  /* Sin identificación fiscal, la línea se omite (no se inventa). */
  if (emitter.taxId) {
    drawLine(ctx, `${emitter.taxLabel}: ${emitter.taxId}`, {
      size: 8,
      color: MUTED,
    });
  }
  const leftBottom = ctx.y;
  ctx.y = headerTop;
  drawLine(ctx, document.label.toUpperCase(), {
    size: 10,
    font: bold,
    color: MUTED,
    align: 'right',
    gapAfter: 2,
  });
  drawLine(ctx, `#${document.number}`, { size: 20, font: bold, align: 'right', gapAfter: 2 });
  drawLine(ctx, formatDateEs(document.issuedAt, timezone), {
    size: 9,
    color: MUTED,
    align: 'right',
  });
  ctx.y = Math.min(leftBottom, ctx.y);
  spacer(ctx, 20);
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y },
    end: { x: RIGHT_EDGE, y: ctx.y },
    thickness: 2,
    color: INK,
  });
  spacer(ctx, 32);

  if (voided) {
    drawLine(ctx, 'ANULADO', {
      size: 14,
      font: bold,
      color: VOID_RED,
      align: 'center',
    });
    spacer(ctx, 16);
  }

  /* Columnas emisor / receptor. */
  const columnsTop = ctx.y;
  const gutter = 40;
  const colWidth = (CONTENT_WIDTH - gutter) / 2;
  if (emitter.address) {
    drawLine(ctx, 'Datos del Emisor', {
      size: 9,
      font: bold,
      color: MUTED,
      maxWidth: colWidth,
    });
    drawLine(ctx, 'Dirección / Sede'.toUpperCase(), {
      size: 7,
      font: bold,
      color: FAINT,
      maxWidth: colWidth,
      gapAfter: 2,
    });
    drawLine(ctx, emitter.address, { size: 10, font: bold, maxWidth: colWidth });
  }
  const emitterBottom = ctx.y;
  ctx.y = columnsTop;
  drawLine(ctx, 'Datos del Receptor', {
    size: 9,
    font: bold,
    color: MUTED,
    x: MARGIN + colWidth + gutter,
    maxWidth: colWidth,
  });
  drawLine(ctx, 'Socio / Cliente'.toUpperCase(), {
    size: 7,
    font: bold,
    color: FAINT,
    x: MARGIN + colWidth + gutter,
    maxWidth: colWidth,
    gapAfter: 2,
  });
  drawLine(ctx, recipient.name, {
    size: 10,
    font: bold,
    x: MARGIN + colWidth + gutter,
    maxWidth: colWidth,
  });
  if (recipient.documentId) {
    drawLine(ctx, `${recipient.docLabel ?? 'Doc.'} del Socio`.toUpperCase(), {
      size: 7,
      font: bold,
      color: FAINT,
      x: MARGIN + colWidth + gutter,
      maxWidth: colWidth,
      gapAfter: 2,
    });
    drawLine(ctx, recipient.documentId, {
      size: 10,
      font: bold,
      x: MARGIN + colWidth + gutter,
      maxWidth: colWidth,
    });
  }
  ctx.y = Math.min(emitterBottom, ctx.y);
  spacer(ctx, 40);

  if (method.maskedDetails && method.maskedDetails.length > 0) {
    drawLine(ctx, 'Información de la Transacción', {
      size: 9,
      font: bold,
      color: MUTED,
    });
    for (const detail of method.maskedDetails) {
      drawLine(ctx, detail.label.toUpperCase(), {
        size: 7,
        font: bold,
        color: FAINT,
        gapAfter: 2,
      });
      drawLine(ctx, detail.value, { size: 10, font: bold });
    }
    spacer(ctx, 20);
  }

  /* Tabla: descripción / total (rótulos en la misma fila). */
  const tableHeaderTop = ctx.y;
  drawLine(ctx, 'Descripción'.toUpperCase(), {
    size: 7,
    font: bold,
    color: FAINT,
    maxWidth: CONTENT_WIDTH * 0.7,
    gapAfter: 0,
  });
  ctx.y = tableHeaderTop;
  drawLine(ctx, 'Total'.toUpperCase(), {
    size: 7,
    font: bold,
    color: FAINT,
    align: 'right',
    gapAfter: 0,
  });
  drawRule(ctx, { gapBefore: 10, gapAfter: 12 });
  const bodyTop = ctx.y;
  drawLine(ctx, sale.planName.toUpperCase(), {
    size: 11,
    font: bold,
    maxWidth: CONTENT_WIDTH * 0.7,
    gapAfter: 2,
  });
  drawLine(ctx, `Período ${formatDateEs(sale.periodStart, timezone)} — ${formatDateEs(sale.periodEnd, timezone)}`, {
    size: 8,
    color: MUTED,
    maxWidth: CONTENT_WIDTH * 0.7,
    gapAfter: 2,
  });
  drawLine(ctx, `Método: ${method.name}`, {
    size: 8,
    color: MUTED,
    maxWidth: CONTENT_WIDTH * 0.7,
  });
  const amountText = formatCents(amounts.total, amounts.currencyPaid, format);
  const amountWidth = measure(bold, 12, sanitize(amountText, supported));
  const amountY = bodyTop - 12 * 1.4;
  if (amountY >= BOTTOM_LIMIT) {
    page.drawText(sanitize(amountText, supported), {
      x: RIGHT_EDGE - amountWidth,
      y: amountY,
      size: 12,
      font: bold,
      color: INK,
    });
  }
  spacer(ctx, 30);
  drawRule(ctx, { gapBefore: 0, gapAfter: 15 });

  /* Totales (alineados a la derecha). */
  const right = { align: 'right' } as const;
  drawLine(ctx, `Subtotal: ${formatCents(amounts.subtotal, amounts.currencyPaid, format)}`, {
    size: 10,
    font: bold,
    ...right,
  });
  for (const line of amounts.taxDetails) {
    drawLine(
      ctx,
      `${line.name.toUpperCase()} (${Math.round(line.rate * 100)}%): ${formatCents(line.amount, amounts.currencyPaid, format)}`,
      { size: 10, font: bold, ...right },
    );
  }
  drawLine(ctx, 'Total Pagado:'.toUpperCase(), {
    size: 10,
    font: bold,
    color: FAINT,
    ...right,
    gapAfter: 2,
  });
  drawLine(ctx, formatCents(amounts.total, amounts.currencyPaid, format), {
    size: 22,
    font: bold,
    ...right,
  });
  if (showConversion) {
    drawLine(
      ctx,
      `Tasa aplicada: 1 ${baseCurrency} = ${amounts.exchangeRateApplied} ${amounts.currencyPaid}`,
      { size: 8, color: MUTED, ...right, gapAfter: 2 },
    );
    if (amounts.baseTotal != null) {
      drawLine(
        ctx,
        `Equivalente: ${formatCents(amounts.baseTotal, baseCurrency, format)}`,
        { size: 8, color: MUTED, ...right, gapAfter: 2 },
      );
    }
  }
  drawLine(ctx, `Pagado el ${formatDateEs(sale.paymentDate, timezone)}`, {
    size: 8,
    color: MUTED,
    ...right,
  });

  /* Pie legal. */
  spacer(ctx, 60);
  for (const line of footer.disclaimer) {
    drawLine(ctx, line, { size: 7, color: FAINT, align: 'center', gapAfter: 4 });
  }
  spacer(ctx, 11);
  drawLine(ctx, footer.generatedBy.toUpperCase(), {
    size: 8,
    font: bold,
    color: FAINT,
    align: 'center',
  });

  return doc.save();
}

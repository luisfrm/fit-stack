export interface RevenueBucket {
  readonly month: string;
  readonly normalizedAmount: number;
  readonly unconvertedAmount: number;
}

/**
 * Cobrado del mes: suma normalizada (centavos) del último bucket de
 * `monthlyReport`. Fuente ya disponible en la página de pagos.
 *
 * Returns `null` when the last bucket contains payments without an exact
 * persisted rate: a partial sum is never presented as the month total.
 */
export function monthCollectedTotal(rows: RevenueBucket[]): number | null {
  if (rows.length === 0) return null;
  let last = rows[0]?.month ?? "";
  for (const row of rows) {
    if (row.month > last) last = row.month;
  }
  const lastMonthRows = rows.filter((row) => row.month === last);
  if (lastMonthRows.some((row) => row.unconvertedAmount > 0)) return null;
  return lastMonthRows.reduce((acc, row) => acc + row.normalizedAmount, 0);
}

/**
 * Cobro por suscripción activa: cobrado del mes / suscripciones activas.
 * `null` cuando no hay suscripciones activas (evita dividir por cero).
 * Solo inputs ya disponibles (`monthlyReport` + `KpiSection`).
 */
export function perActiveSubscription(
  monthTotalCents: number | null,
  activeSubscriptions: number,
): number | null {
  if (monthTotalCents === null) return null;
  if (activeSubscriptions <= 0) return null;
  return monthTotalCents / activeSubscriptions;
}

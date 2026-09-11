export interface RevenueBucket {
  readonly month: string;
  readonly normalizedAmount: number;
}

/**
 * Cobrado del mes: suma normalizada (centavos) del último bucket de
 * `monthlyReport`. Fuente ya disponible en la página de pagos.
 */
export function monthCollectedTotal(rows: RevenueBucket[]): number {
  if (rows.length === 0) return 0;
  let last = rows[0]?.month ?? "";
  for (const row of rows) {
    if (row.month > last) last = row.month;
  }
  return rows
    .filter((row) => row.month === last)
    .reduce((acc, row) => acc + row.normalizedAmount, 0);
}

/**
 * Cobro por suscripción activa: cobrado del mes / suscripciones activas.
 * `null` cuando no hay suscripciones activas (evita dividir por cero).
 * Solo inputs ya disponibles (`monthlyReport` + `KpiSection`).
 */
export function perActiveSubscription(
  monthTotalCents: number,
  activeSubscriptions: number,
): number | null {
  if (activeSubscriptions <= 0) return null;
  return monthTotalCents / activeSubscriptions;
}

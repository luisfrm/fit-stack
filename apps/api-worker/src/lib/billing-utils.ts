/**
 * Utilidades para manejo de fechas y duraciones en lógica de billing.
 */

export type DurationUnit = 'day' | 'week' | 'month' | 'year';

/**
 * Suma una duración a una fecha. Maneja correctamente meses con días variables.
 */
export function addDuration(
  base: Date,
  value: number,
  unit: DurationUnit
): Date {
  const result = new Date(base);

  switch (unit) {
    case 'day':
      result.setUTCDate(result.getUTCDate() + value);
      break;
    case 'week':
      result.setUTCDate(result.getUTCDate() + value * 7);
      break;
    case 'month':
      result.setUTCMonth(result.getUTCMonth() + value);
      break;
    case 'year':
      result.setUTCFullYear(result.getUTCFullYear() + value);
      break;
  }

  return result;
}

/**
 * Resta una duración a una fecha.
 */
export function subtractDuration(
  base: Date,
  value: number,
  unit: DurationUnit
): Date {
  return addDuration(base, -value, unit);
}

/**
 * Convierte centavos a unidades principales (divide por 100).
 */
export function centsToUnits(cents: number): number {
  return cents / 100;
}

/**
 * Convierte unidades principales a centavos (multiplica por 100 y redondea).
 */
export function unitsToCents(units: number): number {
  return Math.round(units * 100);
}

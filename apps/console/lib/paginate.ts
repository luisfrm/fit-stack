/**
 * Paginación local sobre listas ya cargadas (RSC + Next cache para la
 * lectura; el widget solo pagina en cliente con useState).
 */
export function paginate<T>(
  items: readonly T[],
  page: number,
  pageSize: number,
): T[] {
  const safePage = Math.max(1, Math.floor(page));
  const start = (safePage - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

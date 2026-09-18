/**
 * Descarga un Blob en el navegador (PDF de comprobante, CSV de reportes).
 * Un solo lugar: evita repetir el lifecycle del object URL.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

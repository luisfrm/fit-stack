# Fase 5 — Verificación completa + render real en workerd

> Requiere: Fases 2–4. Es la puerta del PR: nada se mergea sin el render probado en workerd real.

## Objetivo

Demostrar que el fix funciona donde fallaba: en workerd, no solo en Node.

## Archivos

- Temporal de verificación (handler de dev, **a eliminar después**). Ningún cambio productivo adicional salvo lo que pidan los resultados.

## Pasos

1. `pnpm --filter jobs-worker test`.
2. `pnpm typecheck` (raíz).
3. `pnpm lint` (raíz).
4. `pnpm test` (raíz: incluye los tests de integración de `api-worker` que mockean `receipt-pdf`; deben pasar sin cambios por conservarse el nombre del módulo).
5. `wrangler deploy --dry-run` sin errores (sin chunk dinámico de Yoga).
6. **Render real en workerd**: handler temporal de dev que llame `renderReceiptPdfBytes` con datos de ejemplo + curl; assert de que la respuesta empieza por `%PDF-` y no hay `CompileError`. Eliminar el handler después.
7. Inspección manual de dos PDFs generados: uno vigente y uno ANULADO (contenido completo, una sola página, sello rojo solo en el anulado, sin `---`).

## Criterio de done

Suite verde en todos los niveles, dry-run limpio, `%PDF-` obtenido en workerd real y 2 PDFs inspeccionados a mano. Evidencia adjunta al PR.

## Verificación

- Salidas de los 6 comandos + curl con assert `%PDF-`, todo en el PR.
- Confirmación de que el handler temporal fue eliminado (no queda ruta de dev en el diff).

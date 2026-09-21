# FS-0004 — Índice de fases

> Orden de ejecución y dependencias. Detalle de implementación en cada archivo. Plan maestro en `../plan.md`; requerimiento en `../task.md`.

## Orden recomendado

1. **Fase 0** (`fase-0-spike.md`) — spike en workerd real; registra `{name, message, cause}`. Sin dependencias. **Bloquea las Fases 1–3 y 5**: sin confirmación no se borra nada.
2. **Fase 1** (`fase-1-dependencias.md`) — `pdf-lib` dentro, `@react-pdf/renderer` fuera, `react` intacto + lock. Requiere Fase 0.
3. **Fase 2** (`fase-2-rewrite-pdf-lib.md`) — rewrite `receipt-pdf.tsx` → `receipt-pdf.ts` (una página, misma firma, mismo módulo). Requiere Fase 1. No toca `receipt.handler.ts` ni `packages/shared`/`packages/database`.
4. **Fase 3** (`fase-3-tests.md`) — extractor pdf-lib (inflate + `<hex> Tj` latin1), mismos 5 casos. Requiere Fase 2.
5. **Fase 4** (`fase-4-logging.md`) — `{name, message, cause}` en `index.ts:65-68`. Sin dependencias; paralelizable con 0–3 (y va primero si el spike no reproduce).
6. **Fase 5** (`fase-5-verificacion.md`) — suites + dry-run + **render real en workerd** (`%PDF-`, handler temporal eliminado) + inspección manual de 2 PDFs. Requiere Fases 2–4. Puerta del PR.
7. **Fase 6** (`fase-6-docs.md`) — la ejecuta otro agente: `README` de jobs-worker, `AGENTS.md`, `comprobantes.md:31`, nota en [[FS-0001]]. Requiere Fase 5.
8. **Fase 7** (`fase-7-ops-post-deploy.md`) — barrido forzado, monitoreo de DLQ, ráfaga de emails aceptada. Requiere deploy de la Fase 5.

## Mapa de módulos por capa

| Capa | Archivos que se tocan |
| ---- | --------------------- |
| `apps/jobs-worker` | `src/receipt-pdf.tsx` → `src/receipt-pdf.ts`, `src/index.ts:65-68`, `package.json`, `tests/receipt-pdf.test.ts`, `README.md:18` (Fase 6) |
| `apps/api-worker` | Sin cambios (solo re-ejecución de tests que mockean `receipt-pdf`) |
| `packages/shared` / `packages/database` | Sin cambios (sin migración) |
| Docs bóveda | `AGENTS.md`, `vaults/backlog/comprobantes.md:31`, nota en `FS-0001-payment-receipts/` (Fase 6) |

## Reglas de ejecución

- Rama `feat/FS-0004-fix-receipt-pdf-render-en-jobs-worker-react-pdf-a-pdf-lib`; **1 task = 1 PR**; sin push ni commits automáticos.
- `receipt.handler.ts`, la firma `renderReceiptPdfBytes`, el nombre del módulo `receipt-pdf` y el `renderFormat` no se tocan.
- Sin `---` en el PDF (omisión, no placeholder); sanitización WinAnsi de todo texto de usuario.
- Cada fase cierra con su verificación; la Fase 5 exige evidencia en workerd real adjunta al PR.

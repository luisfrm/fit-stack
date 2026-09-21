# Plan de ejecución — FS-0004: fix receipt PDF render (react-pdf → pdf-lib)

> Task: [[FS-0004]] · depende de [[FS-0001]] (contrato de comprobantes) · rama `feat/FS-0004-fix-receipt-pdf-render-en-jobs-worker-react-pdf-a-pdf-lib` · **1 task = 1 PR**. Sin migración de base de datos (no se toca ninguna tabla).

## Diagnóstico (congelado, no re-discutir)

- `apps/jobs-worker/src/handlers/receipt.handler.ts:143` importa `../receipt-pdf` y renderiza con `@react-pdf/renderer` (`pdf(...).toBlob()`).
- La cadena `@react-pdf/renderer` → `@react-pdf/layout` → `yoga-layout@3.2.1` trae un `top-level await loadYoga()` que instancia WASM desde un buffer base64 con `WebAssembly.instantiate(bytes)`.
- Cloudflare workerd prohíbe esa generación dinámica (`CompileError: Wasm code generation disallowed by embedder`; cloudflare/workerd#3345, diegomura/react-pdf#2757).
- Vitest corre en Node, donde el WASM dinámico sí está permitido: el render nunca se ejercitó en workerd real. Por eso los tests pasan y producción falla al 100 %.
- Consecuencia: pagos numerados sin PDF, sin email, reintentos hasta la DLQ.

## Orden de fases (por dependencias)

| Fase | Nombre | Depende de | Qué entrega |
| ---- | ------ | ---------- | ----------- |
| 0 | Spike: confirmar en workerd | — | Error real registrado (`{name, message, cause}`); luz verde o stop |
| 1 | Dependencias: pdf-lib dentro, react-pdf fuera | Fase 0 | `package.json` + lock consistentes; `react`/`@types/react` intactos |
| 2 | Rewrite `receipt-pdf.tsx` → `receipt-pdf.ts` con pdf-lib | Fase 1 | Render de 1 página, misma firma, mismo módulo, contenido completo |
| 3 | Tests del extractor pdf-lib | Fase 2 | `receipt-pdf.test.ts` en verde con los 5 casos |
| 4 | Logging `{name, message, cause}` en `index.ts` | — (paralelizable con 0–3) | Errores del consumer siempre accionables |
| 5 | Verificación completa + render real en workerd | Fases 2–4 | Suite verde, dry-run limpio, `%PDF-` en workerd, inspección manual |
| 6 | Docs (la implementa otro agente) | Fase 5 | `README` de jobs-worker, `AGENTS.md`, `comprobantes.md:31`, nota en [[FS-0001]] |
| 7 | Ops post-deploy: barrido + DLQ + ráfaga aceptada | Fase 5 (deploy) | Backlog drenado, DLQ vacía, emails del backlog emitidos |

## Capas tocadas (en orden)

1. **Spike / entorno** (Fase 0): `wrangler dev` + ruta de render, o `wrangler deploy --dry-run --outdir`. Sin cambios de código productivo.
2. **Dependencias** (Fase 1): `apps/jobs-worker/package.json` + `pnpm-lock.yaml` (vía `pnpm install` desde la raíz).
3. **Backend jobs-worker** (Fases 2 y 4): `src/receipt-pdf.ts` (nuevo, vía `git mv`), `src/index.ts:65-68`. `receipt.handler.ts` **no se toca**.
4. **Tests** (Fase 3): `apps/jobs-worker/tests/receipt-pdf.test.ts` + re-ejecución de los tests de integración de `api-worker` que mockean `receipt-pdf`.
5. **Verificación** (Fase 5): `pnpm --filter jobs-worker test`, `pnpm typecheck`, `pnpm lint`, `pnpm test` (raíz), `wrangler deploy --dry-run`, render real en workerd, inspección manual de 2 PDFs.
6. **Docs** (Fase 6): `apps/jobs-worker/README.md:18`, `AGENTS.md` (Background Jobs), `vaults/backlog/comprobantes.md:31`, nota en `vaults/tasks/FS-0001-payment-receipts/` sin reescribir fases cerradas.
7. **Ops** (Fase 7): `sweepPendingReceiptPdfs` forzado, monitoreo de `fit-receipt-events-dlq`, ráfaga de emails aceptada.

## Riesgos y mitigaciones

- **El spike no reproduce el error** → stop: no se borra nada; se re-diagnostica con el `{name, message, cause}` de la Fase 4 ya aplicada.
- **Texto que desborda la página única** → `maxWidth` + elipsis en tokens irrompibles; el contenido manda sobre la estética.
- **Caracteres fuera de WinAnsi** (nombres, direcciones) → sanitización contra `font.getCharacterSet()`; jamás el placeholder `---` (lo prohíbe `checklistPrePdf`).
- **Ráfaga de emails post-deploy** → aceptada por el usuario (decisión 3); se monitorea, no se evita.
- **Regresión en api-worker** → sus tests mockean `receipt-pdf` por ruta de módulo: al conservar el nombre del módulo, la Fase 5 los re-ejecuta sin cambios.

## Verificación global

`pnpm --filter jobs-worker test` → `pnpm typecheck` → `pnpm lint` → `pnpm test` (raíz) → `wrangler deploy --dry-run` sin errores → render real en workerd con assert `%PDF-` → inspección manual de un PDF vigente y uno ANULADO. Detalle por fase en `phases/`.

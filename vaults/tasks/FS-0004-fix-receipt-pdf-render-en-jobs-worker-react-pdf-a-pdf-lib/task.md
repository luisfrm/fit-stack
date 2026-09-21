---
id: FS-0004
aliases: ["FS-0004"]
title: "Fix receipt PDF render en jobs-worker (react-pdf a pdf-lib)"
status: in_progress # draft | planning | in_progress | blocked | done | cancelled
priority: critical # low | medium | high | critical
created: 2026-09-20
depends_on: [FS-0001] # hereda el contrato de comprobantes (numeración, R2, checklistPrePdf); no reescribe fases cerradas
pr: null # URL del PR cuando exista
---

# FS-0004 — Fix receipt PDF render en jobs-worker (react-pdf a pdf-lib)

## Problema

El render del PDF de comprobantes está caído al 100 % en producción (worker `fit-stack-jobs`, cola `fit-receipt-events`). Cada mensaje de render falla con un error de texto vacío y solo el stack dentro de `renderAndStoreReceiptPdf`:

`"message": "Failed to render receipt fefa063261c8ffa41bea13ab13c44f1d:     at renderAndStoreReceiptPdf (index.js:159804:11)\n    at handleReceiptRender (index.js:159891:28)\n    at async Object.queue (index.js:160104:11)"`

Causa raíz diagnosticada (validada por un reviewer): `apps/jobs-worker/src/receipt-pdf.tsx` usa `@react-pdf/renderer` (`pdf(...).toBlob()`), cuya dependencia transitiva `yoga-layout@3.2.1` instancia WASM con `WebAssembly.instantiate(bytes)` en un `top-level await`. Cloudflare workerd prohíbe esa generación dinámica de código (`CompileError: Wasm code generation disallowed by embedder` — ver cloudflare/workerd#3345 y diegomura/react-pdf#2757). Los tests pasan porque corren en Node (Vitest), donde el WASM dinámico sí está permitido: el render nunca se ejercitó en workerd real.

Impacto: todo pago validado queda **numerado sin PDF, sin email**, y la cola reintenta hasta la DLQ. Ni Panel ni Console pueden entregar comprobantes.

## Criterios de aceptación

- [ ] El spike confirma el error real en workerd (`wrangler dev` o `deploy --dry-run`) antes de borrar ninguna dependencia.
- [ ] `@react-pdf/renderer` eliminado de `apps/jobs-worker`; `pdf-lib` añadido; `react`/`@types/react` se mantienen (peer de `resend`/`@react-email/render`).
- [ ] `apps/jobs-worker/src/receipt-pdf.ts` (renombrado desde `.tsx` con `git mv`) expone **exacta** la firma `renderReceiptPdfBytes(data: ReceiptData, format: CurrencyFormat = 'latam'): Promise<Uint8Array>`; el módulo sigue llamándose `receipt-pdf` (los tests de integración de `api-worker` lo mockean por esa ruta).
- [ ] El PDF cabe en **una sola página** (A4, margen 40pt) con todo el contenido actual: cabecera del emisor, etiqueta del documento + número + fecha, sello ANULADO cuando aplica, columnas emisor/receptor, detalles de transacción, tabla, totales, conversión de moneda, disclaimer y `generatedBy`.
- [ ] Sin placeholders `---`: los campos sin dato se **omiten** (`checklistPrePdf` sigue pasando); todo texto de usuario se sanitiza a WinAnsi.
- [ ] `apps/jobs-worker/tests/receipt-pdf.test.ts` reescrito al formato de pdf-lib (streams inflados, texto en hex) con los mismos 5 casos en verde.
- [ ] Los errores del consumer loguean `{name, message, cause}` (nunca más un mensaje vacío).
- [ ] Render real verificado en workerd (handler temporal de dev + curl, assert `%PDF-` sin `CompileError`; handler eliminado después) e inspección manual de un PDF vigente y uno ANULADO.
- [ ] Docs actualizadas según la Fase 6 (la implementa otro agente, queda planificada aquí).

## Alcance

| Capa                | Archivos / módulos |
| ------------------- | ------------------ |
| `apps/jobs-worker`  | `src/receipt-pdf.tsx` → `src/receipt-pdf.ts` (rewrite con `pdf-lib`); `src/index.ts:65-68` (logging `{name, message, cause}`); `package.json` (deps); `tests/receipt-pdf.test.ts` (rewrite del extractor); `README.md:18` (docs, Fase 6) |
| `apps/api-worker`   | Sin cambios de código (solo se re-ejecutan sus tests de integración por los mocks a `receipt-pdf`) |
| `packages/shared`   | Sin cambios (firma `ReceiptData`, `CurrencyFormat`, `formatCents`, `checklistPrePdf` intactos) |
| `packages/database` | Sin cambios (sin migración: no se toca ninguna tabla) |
| Docs bóveda         | `AGENTS.md` (sección Background Jobs), `vaults/backlog/comprobantes.md:31`, nota de corrección en [[FS-0001]] (Fase 6) |

## Fuera de alcance

- Homologación fiscal / facturación electrónica formal → [[fiscal]].
- Cambios en la numeración, el barrido, los gates de email o el contrato de 3 estados → [[FS-0001]] (cerrada; aquí solo se repara el motor de render).
- `claim-then-number`, marca de agua diagonal del ANULADO y demás pendientes visuales → [[comprobantes]].
- Bridge / `apps/api` legacy → ⏸ pausados, no se tocan.

## Notas

- Decisión aprobada 1: layout simplificado a **una sola página** — es un comprobante de pago, no un documento multipágina.
- Decisión aprobada 2: **spike primero** en workerd real antes de borrar nada (Fase 0); solo se sigue si el error se confirma.
- Decisión aprobada 3: la **ráfaga de emails atrasados post-deploy está aceptada** — el barrido re-encola el backlog numerado sin PDF y los emails saldrán de golpe (Fase 7).
- Restricciones duras de la Fase 2: no tocar `receipt.handler.ts:143/435` ni `:144-147/436-439` ni el `renderFormat`; no renombrar el módulo `receipt-pdf`; pérdida aceptada de `letterSpacing`/flex/`borderRadius` (fidelidad de contenido, no de píxeles).
- Rama de trabajo: `feat/FS-0004-fix-receipt-pdf-render-en-jobs-worker-react-pdf-a-pdf-lib`. **1 task = 1 PR.** Sin push ni commits automáticos.

## Plan de ejecución

> Generado por el agente `planner` en `plan.md`; el detalle por fase vive en `phases/` (índice en `phases/README.md`).

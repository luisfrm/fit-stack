# Fase 6 — Docs (la implementa otro agente)

> Requiere: Fase 5 (documentar lo verificado, no lo supuesto). Planificada aquí, ejecutada por otro agente.

## Objetivo

Que ningún doc siga afirmando que el render usa `@react-pdf/renderer`, y que la corrección quede trazada sin reescribir historia cerrada.

## Archivos

- `apps/jobs-worker/README.md:18` (línea del render lazy con `@react-pdf/renderer` → pdf-lib).
- `AGENTS.md`, sección Background Jobs (hoy dice "lazy `@react-pdf/renderer`" → pdf-lib; la mención al render en `receipt-pdf.tsx` pasa a `receipt-pdf.ts`).
- `vaults/backlog/comprobantes.md:31` (el "texto rojo en la cabecera (`receipt-pdf.tsx`)" → nuevo motor/archivo; evaluar si el ítem de marca de agua sigue vigente).
- Nota de corrección en `vaults/tasks/FS-0001-payment-receipts/` (anexo, **sin reescribir sus fases cerradas**).

## Criterio de done

Cero menciones vigentes a `@react-pdf/renderer` en docs, y la corrección referenciada desde [[FS-0001]] como nota (enlace a [[FS-0004]]).

## Verificación

- Búsqueda de `react-pdf` en `AGENTS.md`, `apps/jobs-worker/README.md` y `vaults/backlog/comprobantes.md` sin resultados vigentes.
- `vaults/tasks/README.md` con esta task en su estado real.

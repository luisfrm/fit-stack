# Plan maestro — Comprobantes Panel + Console

> Última actualización: sept 2026. Este documento es la fuente de verdad del estado del proyecto. Las tasks individuales (`fase-*.md`) contienen el detalle de implementación de cada fase; este `plan.md` consolida decisiones, estado y orden.

## Estado actual

| Fase | Estado | Commit |
|---|---|---|
| Fase 0 — Lógica pura (`@workspace/shared`) | ✅ Hecha | `bc77afd` |
| Fase 0.5 — Centavos honestos + `ValueConverter` único | ✅ Hecha | `8736a90`…`a00cc73` |
| Addendum Fase 1 — repo de comprobantes a `packages/database` | 🔧 En revisión (sin commit) |  |
| Fase 1 — DB Panel (secuencia + columnas) | ✅ Hecha | `24e9ab1`…`455cc37` |
| Fase 2 — Emisión Panel (render en jobs-worker) | 🔧 En revisión (sin commit) |  |
| Fase 3 — Email + PDF adjunto + UI panel | 🔧 En revisión (sin commit) |  |
| Fase 4 — Config fiscal por org | ⏳ Pendiente (requiere Fase 0, paralelizable con Fase 3) |  |
| Fase 5 — Reporte de gaps y auditoría | ⏳ Pendiente (requiere Fase 2) |  |
| Fase 6 — Cierre Panel (tests, E2E, docs) | ⏳ Pendiente (requiere 0–5) |  |
| C1 — DB Console (secuencia global + emisor) | ⏳ Pendiente (requiere Fase 0, config paralelizable con 1–2) |  |
| C2 — Emisión Console en dos pasos | ⏳ Pendiente (requiere C1 + Fase 2) |  |
| C3 — UI Console + cierre | ⏳ Pendiente (requiere C2 + Fase 3) |  |

## Orden de ejecución

```
Fase 0 ──▶ Fase 1 ──▶ Fase 2 ──┬──▶ Fase 3 (3A + 3B en paralelo) ──┐
                                ├──▶ Fase 5                         ├──▶ Fase 6
        Fase 4 (paralela a 3) ─┘                                   ┘

Fase 0 ──▶ C1 (config paralelizable con Fases 1–2) ──▶ C2 (requiere patrón de Fase 2) ──▶ C3 (requiere R2 en jobs de Fase 3)
```

Console (C1–C3) arranca en paralelo desde Fase 0 en su parte de configuración, pero **su emisión (C2) no puede escribirse antes de que el patrón de dos pasos de Fase 2 exista y esté probado** — C2 es un espejo, no una implementación independiente.

## Decisiones congeladas (no volver a discutir por task)

**Naturaleza del documento**
- PDF es la fuente de verdad; el email es notificación corta que adjunta ese mismo PDF (nunca lo regenera).
- PDF persistido en R2, generado una sola vez, inmutable.
- UUID técnico (`payment.id` / `platformSubscriptionPayment.id`) nunca visible al cliente. `receiptNumber` es un campo humano separado.
- Dos secuencias, por dos emisores legales distintos: **por-org** (`{slug}-año-n`, cada gym es su propio emisor) en Panel, **global continua** (`FS-N`, sin año — FitStack es un único emisor) en Console.
- Etiqueta del documento resuelta por gate de 3 condiciones (`taxId` + `isFormalTaxpayer:true` + homologación fiscal real conectada); si falta cualquiera, se fuerza `"Comprobante de pago"` aunque el org/FitStack pida `"Factura"`. Hoy `hasFiscalHomologation` es `false` por construcción en ambos niveles → nunca es `"Factura"`.
- Impuestos: modelo híbrido — automático desde `resolveFiscalProfile` (país + override de la org), con override manual solo si viene acompañado de `taxOverrideReason` no vacío (auditable).
- Numeración: Panel reinicia por año en timezone del emisor (gym); Console es continua sin año (ver nota de C1).
- Pago `voided` con número ya emitido: se marca **ANULADO** (`receipt_voided`, `voided_by/at/reason`), nunca se libera ni reusa el número. El reporte de huecos distingue explícitamente "anulado" (explicado) de "hueco" (sospechoso).
- Sin backfill de históricos: quedan con `receipt_number IS NULL`, tratados como estado terminal `pre_system`, no como error.
- Emitir ≠ enviar: la emisión (asignar número + generar PDF) nunca depende de que el miembro tenga email; el envío es una acción aparte, solo disponible si hay email.
- `isFormalTaxpayer: true` exige declaración explícita con checkbox + confirmación (`confirmed: true` en el body), no un toggle cosmético.
- `featuresSnapshot` no se imprime en el PDF pero queda disponible para exportación si el Org lo pide.
- El disclaimer de Console usa el país del **org receptor** como proxy hasta que exista `fitstack_country_code` propio — documentado como ítem explícito en `docs/PENDING.md`, no solo TODO en código.

**Concurrencia (sin transacciones interactivas en serverless)**
- La asignación del número correlativo es **una sola sentencia atómica** (`INSERT … ON CONFLICT DO UPDATE … RETURNING`), sin transacción interactiva ni `SELECT FOR UPDATE` — compatible con el driver HTTP de Neon. Cubre también la carrera del primer comprobante del año/emisor sin fila previa.
- **Nunca hay rollback de un número.** El estado `receipt_number IS NOT NULL AND receipt_pdf_key IS NULL` es válido y significa "numerado, PDF pendiente" — no un error.
- Emisión en **dos pasos**: paso 1 síncrono (asigna número, rápido, sin I/O externo, en el request que valida el pago) + paso 2 asíncrono (render PDF + `PUT` R2 + `UPDATE receipt_pdf_key`) en un **consumer de cola dedicada `fit-receipt-events`** que vive en `apps/jobs-worker` (compose vía repo compartido `packages/database` + fiscal `@workspace/shared`, sin duplicar lógica). `api-worker` es solo **productor** de esa cola (paso 1 + `issue` + re-encolados); no agrega `@react-pdf/renderer`.
- El **email se encola desde el paso 2**, solo tras confirmar `UPDATE … WHERE receipt_pdf_key IS NULL RETURNING` con `rowCount === 1` — nunca desde el paso 1. Esto garantiza que un comprobante numerado nunca dispare un email sin su PDF adjunto.
- **Idempotencia ante entrega duplicada** (colas *at-least-once*): reintentar el paso 2 con el mismo número/key es un simple overwrite sin efecto adicional; el `UPDATE … RETURNING` actúa como gate para no encolar un segundo email.
- **Barrido periódico** (cron en `jobs-worker`, **pre-venta cada 10 h**; bajar a 10 min con clientes reales — ver `docs/PENDING.md`) cierra el hueco "número asignado pero mensaje nunca llegó a la cola": busca filas con número y sin PDF más viejas que 15 minutos y re-encola el render. Cubre tanto Panel como Console (mismo mecanismo, extendido a `platform_subscription_payment` en C2).
- Console reutiliza la **misma cola y el mismo tipo de evento** `receipt.render`, discriminado por un campo `scope: 'panel' | 'platform'` en el payload — no un evento nuevo, para no duplicar el registro de tipos ni el consumer.

**Contrato de API**
- `GET /:id/receipt` responde uno de tres estados, nunca `409`: `200 { available:true, pdfStatus:'ready', ... }` · `202 { available:true, pdfStatus:'pending' }` · `200 { available:false, reason:'pre_system' }` (histórico, terminal).
- `GET /:id/receipt/pdf` es la descarga binaria aparte: `200` bytes `application/pdf` o `404`.
- `POST /:id/issue` (fallback manual, owner/manager) responde de inmediato con `pdfStatus: "pending"`, sin bloquear esperando el render.

**Infraestructura y storage**
- Storage keys simétricas y sin el prefijo confuso `cms/`: `receipts/<org>/<año>/<n>.pdf` (Panel) y `platform/receipts/<año>/FS-<n>.pdf` (Console). No colisiona con `cms/<org>/receipts/` (capturas de pago, distinto propósito).
- Infra de cola/cron se gestiona por Terraform + GitHub Actions (`infrastructure/terraform/queues.tf`, `workers.tf`), nunca con `wrangler` manual.
- Migraciones de DB: flujo estricto `generate → review → migrate`; **prohibido `db:push`** en ramas compartidas.

## Riesgos activos a vigilar

- **Bundle PDF**: `@react-pdf/renderer` vive solo en `jobs-worker` (donde ya era dependencia) y se importa lazy en el path de render; `api-worker` NO lo agrega (criterio de aceptación de Fase 2).
- **Una cola, UN consumer**: `fit-receipt-events` la consume solo `jobs-worker`; `jobs-worker` consume DOS colas distintas (`fit-task-events` emails + `fit-receipt-events` renders), cada una con su DLQ. Nunca dos consumers sobre la misma cola.
- **Repo compartido como excepción**: `packages/database/src/repositories/receipts.repository.ts` (numeración atómica + `getReceiptComposedData` + `completeReceiptPdf`) existe porque dos runtimes necesitan la implementación idéntica; no autoriza mover otros repos (ver AGENTS.md §1).
- **Disclaimer proxy de Console.** Mientras FitStack no tenga `fitstack_country_code` configurado, el disclaimer legal de los comprobantes de Console usa el país del Org receptor. Esto es una aproximación temporal, no la regla correcta a largo plazo — no dejar que este TODO sobreviva silenciosamente hasta producción.

## Reglas de ejecución para todas las fases

- Cada task cierra con `pnpm typecheck` (+ `lint`/`test`/`test:e2e` donde aplique).
- Toasts vía `mutationError(scope, err, "<mensaje genérico>")`, nunca texto crudo del API; post-mutación: `updateTag` + `router.refresh()`.
- Timezone siempre de la org (`requireOrgTimezone`), nunca UTC del servidor — aplica a año de secuencia, filtros de reporte y fechas de emisión.
- Ningún consumidor hardcodea etiquetas/tasas de impuestos: todo default sale de `COUNTRIES[countryCode]` en `@workspace/shared`.

## Próximo paso inmediato

Revisar **Fase 3** (`fase-3-email-pdf-jobs-panel.md`, email corto + adjunto desde R2 + UI del comprobante en el panel: cambios sin commit), y luego **Fase 4** (config fiscal por org, paralelizable) y **Fase 5** (reporte de gaps).
# Plan maestro — Comprobantes Panel + Console

> Última actualización: sept 2026. Este documento es la fuente de verdad del estado del proyecto. Las tasks individuales (`fase-*.md`) contienen el detalle de implementación de cada fase; este `plan.md` consolida decisiones, estado y orden.

## Estado actual

| Fase | Estado | Commit |
|---|---|---|
| Fase 0 — Lógica pura (`@workspace/shared`) | ✅ Hecha | `bc77afd` |
| Fase 0.5 — Centavos honestos + `ValueConverter` único | ✅ Hecha | `8736a90`…`a00cc73` |
| Addendum Fase 1 — repo de comprobantes a `packages/database` | ✅ Hecha | `77a7d8b` |
| Fase 1 — DB Panel (secuencia + columnas) | ✅ Hecha | `24e9ab1`…`455cc37` |
| Fase 2 — Emisión Panel (render en jobs-worker) | ✅ Hecha | `309158b` |
| Fase 3 — Email + PDF adjunto + UI panel | ✅ Hecha | `72df4ea` |
| Fase 4 — Config fiscal por org | ✅ Hecha | `bb64026`…`80a8d05` |
| Fase 5 — Reporte de gaps y auditoría | ✅ Hecha | `dd0249e`…`9fd6787` |
| Fase 6 — Cierre Panel (tests, E2E, docs) | ✅ Hecha | `0ce7013`…`7544fef` |
| C1 — DB Console (secuencia global + emisor) | ✅ Hecha | `c1b6310`…`20fb386` |
| C2 — Emisión Console en dos pasos | ✅ Hecha | `7c3c376`…`f1433ab` |
| C3 — UI Console + cierre | ✅ Hecha | `2f6c15b`…`4c34d6c` |

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
- Pago `voided` con número ya emitido: se marca **ANULADO** (`receipt_voided`, `voided_by/at/reason`), nunca se libera ni reusa el número. El reporte de huecos distingue explícitamente "anulado" (explicado) de "hueco" (sospechoso). En SaaS (Console) rige el espejo exacto vía `markPlatformReceiptVoided` al pasar a `VOIDED` (motivo fijo, `by` obligatorio fail-closed, sin número → 409 sin revertir el status): **no cancela la suscripción ni revierte `currentPeriodEnd`**, solo cambia el pago + flag. `REFUNDED` (reservado) no toca el flag; `voided` es el único estado de anulación (rechazo y anulación se derivan con `getVoidKind`; `pending` e `invalid` se retiraron).
- Reporte de comprobantes (`GET /api/reports/receipts`): lee impuestos persistidos, nunca recalcula; `issued` exige número + PDF (numerado sin PDF es `pending`); totales solo sobre emitidos no anulados, agrupados por moneda; gaps = `1..lastNumber` por (org, año).
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
- El pagador SaaS (`payer_email/payer_name`) se persiste **solo en creación `processing`** (sesión org renovadora); en validación `SET` solo si `IS NULL`, nunca overwrite (la sesión de soporte no es el pagador). El barrido —que no conoce al pagador— notifica solo a owners con log `payer-missing`.
- Trial/free $0 **no queman serie**: quedan con `receipt_number IS NULL` → `available:false, reason:'pre_system'` (terminal documentado, nunca 409).
- Console reutiliza la **misma cola y el mismo tipo de evento** `receipt.render`, discriminado por un campo `scope: 'panel' | 'platform'` en el payload — no un evento nuevo, para no duplicar el registro de tipos ni el consumer.

**Contrato de API**
- `GET /:id/receipt` responde uno de tres estados, nunca `409`: `200 { available:true, pdfStatus:'ready', ... }` · `202 { available:true, pdfStatus:'pending' }` · `200 { available:false, reason:'pre_system' }` (histórico, terminal).
- `GET /:id/receipt/pdf` es la descarga binaria aparte: `200` bytes `application/pdf` o `404`.
- `POST /:id/issue` (fallback manual, owner/manager) responde de inmediato con `pdfStatus: "pending"`, sin bloquear esperando el render.
- `GET /api/reports/receipts` (auditoría Panel): filas + resumen + totales por moneda + `gaps[]`; filtros `from/to/status/method/year/page/limit`, caché 5 min invalidada on-write en issue/status/alta.
- El email SaaS con comprobante sale **con el PDF adjunto leído de R2** (nunca regenerado); numerado sin PDF → log sin enviar (lo repara el barrido).
- E2E Console cubre aprobar → número + reenvío pending (sin consumer no hay PDF real); descarga de bytes y adjunto idéntico se verifican en integración + manual.

**Infraestructura y storage**
- Storage keys simétricas y sin el prefijo confuso `cms/`: `receipts/<org>/<año>/<n>.pdf` (Panel) y `platform/receipts/<año>/FS-<n>.pdf` (Console). No colisiona con `cms/<org>/receipts/` (capturas de pago, distinto propósito).
- Infra de cola/cron se gestiona por Terraform + GitHub Actions (`infrastructure/terraform/queues.tf`, `workers.tf`), nunca con `wrangler` manual.
- Migraciones de DB: flujo estricto `generate → review → migrate`; **prohibido `db:push`** en ramas compartidas.

## Riesgos activos a vigilar

- **Bundle PDF**: `@react-pdf/renderer` vive solo en `jobs-worker` (donde ya era dependencia) y se importa lazy en el path de render; `api-worker` NO lo agrega (criterio de aceptación de Fase 2).
- **Una cola, UN consumer**: `fit-receipt-events` la consume solo `jobs-worker`; `jobs-worker` consume DOS colas distintas (`fit-task-events` emails + `fit-receipt-events` renders), cada una con su DLQ. Nunca dos consumers sobre la misma cola.
- **Repo compartido como excepción**: `packages/database/src/repositories/receipts.repository.ts` (numeración atómica + `getReceiptComposedData` + `completeReceiptPdf`) existe porque dos runtimes necesitan la implementación idéntica; no autoriza mover otros repos (ver AGENTS.md §1).
- **Carrera de correlativo (riesgo residual de C0).** La asignación del número es atómica, pero si dos emisiones concurrentes del mismo pago compiten y **el perdedor de la carrera obtuvo el `seq` menor**, ese número queda irreclaimable sin renumerar (renumerar está prohibido). La guarda tardía + la compensación de C0 cierran el caso común y reducen la ventana a ~milisegundos, pero no la eliminan. **Disparador:** si `gaps[]` muestra un hueco **no explicado** (ni anulado ni `pre_system`), implementar *claim-then-number* (`docs/PENDING.md` §16).
- **Disclaimer proxy de Console.** Mientras FitStack no tenga `fitstack_country_code` configurado, el disclaimer legal de los comprobantes de Console usa el país del Org receptor. Esto es una aproximación temporal, no la regla correcta a largo plazo — no dejar que este TODO sobreviva silenciosamente hasta producción.

## Reglas de ejecución para todas las fases

- Cada task cierra con `pnpm typecheck` (+ `lint`/`test`/`test:e2e` donde aplique).
- Toasts vía `mutationError(scope, err, "<mensaje genérico>")`, nunca texto crudo del API; post-mutación: `updateTag` + `router.refresh()`.
- Timezone siempre de la org (`requireOrgTimezone`), nunca UTC del servidor — aplica a año de secuencia, filtros de reporte y fechas de emisión.
- Ningún consumidor hardcodea etiquetas/tasas de impuestos: todo default sale de `COUNTRIES[countryCode]` en `@workspace/shared`.

## Track de correcciones (post-revisión)

Tras la auditoría de arquitectura y fiscalidad se abrió `tasks/correcciones-comprobantes.md` (fases C0–C8, decisiones D1–D6 congeladas). No reemplaza este plan: lo corrige.

| Fase | Estado |
|---|---|
| C0 — Integridad del correlativo (orden + carrera) | ✅ Hecha |
| C8 — Guardado de organización org-scoped en Panel (D5) | ✅ Hecha |
| C1 — Snapshot del emisor (registro inmutable) | ✅ Hecha (migración `0016`) |
| C2 — Perfil fiscal conservador (`isFormalTaxpayer`, IGTF) | ✅ Hecha |
| C3 — Fidelidad del PDF (líneas omitidas + equivalente en moneda base) | ✅ Hecha |
| C4 — Auditoría espejo en Console (`FS-N`) | ✅ Hecha |
| C5 — Trazabilidad de emisión (`issued_by`) | ✅ Hecha (misma migración `0016`) |
| C6 — Barrido (2.º predicado) y contrato de anulación | ✅ Hecha |
| C7 — Higiene, docs y matriz de tests | ✅ Hecha |
| C9 — Estados reales (ANULADA ≠ CANCELADA) + registro no eliminable | ✅ Hecha |

Decisiones nuevas que aplican en adelante: `isFormalTaxpayer` gobierna el desglose de impuestos (no solo la etiqueta); IGTF activable, apagado por defecto, con base `gross_first`; el snapshot del emisor se persiste en columna jsonb; *claim-then-number* queda en `docs/PENDING.md` con disparador explícito.

---

## Próximo paso inmediato

**Track Comprobantes completo** (Panel Fases 0–6 + Console C1–C3, commiteado y verificado) + **C0, C8, C2, C3 y C4** del track de correcciones. La auditoría del correlativo ya es simétrica (Panel anual `{slug}-{año}-{n}` y Console global `FS-N`, mismo algoritmo con estrategia inyectada y mismo reporte en ambas apps).

**C1 + C5 completadas** (migración `0016`, aditiva y sin backfill): el comprobante es **reproducible** (el emisor queda congelado al emitir y el compose no lee configuración viva si hay snapshot) y la emisión es **trazable** (`issued_by` del actor de sesión, nunca inventado por el paso 2 ni por el barrido). Ambos reportes exponen emisor congelado + actor y el CSV los exporta.

**C9 completada** (sin migración): el status derivado distingue **ANULADA** (`voided`: el cobro se anuló o se rechazó — el registro es inválido) de **CANCELADA** (`cancelled`: el acceso se revocó con un cobro que sigue siendo válido); un registro financiero **no se elimina** (fuera `DELETE /api/subscriptions/:id`, fuera la acción del panel y el permiso), se anula. Además cerró los dos fallos de E2E: el `storageState` de la org vacía (lo escribe `panel-setup`) y el accionable de pago pendiente (lista de trabajo sin caché).

**C6 completada** (sin migración): el barrido cubre sus **dos** estados de fallo (numerado sin PDF, y PDF listo sin notificar) con una única definición de query para las dos tablas, y la anulación de un pago **sin comprobante** dejó de ser un 200 mudo: el body del PATCH trae `receiptVoided` + `receiptVoidReason: 'not_issued'` y el Panel/Console lo dicen con un toast diferenciado (el código `RECEIPT_NOT_ISSUED` queda como contrato interno del servicio).

**C7 completada** (sin migración: higiene, docs y matriz de tests): la matriz de tests ya cubría lo exigido (E2E del guardado general de sede en `e2e/panel/settings.spec.ts:78-98`; units de `emitterSnapshot`, `baseTotal` y gating fiscal; integración de `issuedBy`). Se añadió `*.log` al `.gitignore` y se destrackearon los 3 logs de `spec/` (siguen en disco), el script `push-test-schema` pasó de `execSync` a `spawnSync` shell-less (guardas intactas) y el naming de `platform_document_sequence.next_number` quedó documentado en `schema.ts` + `docs/PENDING.md` §15, sin migración. El fallo de `prettier --check` por CRLF es deuda preexistente fuera de alcance. **El track C0–C9 queda cerrado.**

**Modelo de estados de pago unificado** (sin migración): `PAYMENT_STATUSES` queda en `processing | validated | voided | refunded`. `processing` absorbe al antiguo `pending` y `voided` unifica rechazo y anulación —el tipo `rejected`/`annulled` se **deriva** con `getVoidKind`—; `invalid` y `pending` se retiraron. `refunded` queda reservado (sin flujo que lo produzca; `docs/PENDING.md` §17) y el status SaaS pasa a `EXISTS(validated|refunded)` (`QUALIFYING_PAYMENT_STATUSES`), ignorando `voided`. Detalle completo en `docs/PAYMENT_STATUSES.md`.

En `docs/PENDING.md` quedan anotadas las aristas abiertas: §12 (`create()` no es atómico de verdad y el borrado de un miembro arrastra su histórico financiero), §13 (el DELETE de la suscripción SaaS en Console puede vaciar la serie `FS-N`), §14 (email que agota reintentos y cae a la DLQ después de la marca de notificado: recuperación manual), §15 (naming de la secuencia, requiere migración) y §16 (*claim-then-number* como cierre total de la carrera de correlativo).
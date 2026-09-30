# Plan — FS-0006 Refactor: unificar el motor de comprobantes Panel↔Console con adapter

> Depende de [[FS-0001]] (modelo de comprobantes), [[FS-0002]] (compensación + periodo servidor) y [[FS-0004]] (render pdf-lib). **1 task = 1 PR** (rama `feat/FS-0006-unificar-motor-comprobantes-adapter`). Prosa en español; rutas, código y comandos en su forma literal.
>
> **Naturaleza del cambio: refactor conductual (behavior-preserving).** No se cambia negocio, esquema ni contratos. Si un test existente necesita editarse, es señal de que se rompió una invariante y el paso se revierte.

## Diagnóstico (verificado, no re-discutir)

1. **Dos orquestadores de paso 1** con el mismo esqueleto: `apps/api-worker/src/services/receipts.service.ts` (`assignReceiptNumber`) y `apps/api-worker/src/services/platform-receipts.service.ts` (`assignPlatformReceiptNumber`). Secuencia idéntica de 9 pasos: cargar pago → validar `validated` → idempotencia por `receiptNumber` → resolver perfil fiscal + snapshot + impuestos **antes de consumir la secuencia** → relectura anti-carrera → `nextDocumentNumber` atómico → validar número → `attachReceipt` → compensar secuencia si se perdió la carrera → `receiptQueue.send`.
2. **Dos repos compartidos** con el mismo contrato: `packages/database/src/repositories/receipts.repository.ts` y `platform-receipts.repository.ts`. Diferencias reales: tabla objetivo, tabla de secuencia (`organizationDocumentSequence` vs `platformDocumentSequence`) y scoping (`orgId` obligatorio vs global).
3. **Dos consumers de paso 2** en `apps/jobs-worker/src/handlers/receipt.handler.ts`: `handleReceiptRender` / `handlePlatformReceiptRender`, con gemelos `renderAndStore{Receipt,PlatformReceipt}Pdf` y `dispatch{Receipt,Platform}Notification`.
4. **Cuatro copias del mapeo `payment → ReceiptData`**: `buildComposeInput` + `buildPlatformComposeInput` (`receipt.handler.ts`) y los mapeos inline de `getReceiptState` (`receipts.service.ts`) + `getPlatformReceiptState` (`platform-receipts.service.ts`).
5. **Clasificación de estado duplicada** (admite deriva): `lib/receipt-report.ts` (`classifyReceiptState`) vs el filtro SQL `issued` de `payments.repository.ts`.
6. **Código muerto verificado** (ver Fase 6): `apps/jobs-worker/src/templates/payment-receipt.ts` (`renderPaymentReceipt` nunca importado; el vivo es `payment-receipt-short.ts`), bloque `if (!isTrial && plan.price === 0) { }` vacío en `platform-subscriptions.service.ts`, y `POST /api/platform/subscriptions/change-plan` que el console invoca (`apps/console/lib/services/platform-subscriptions-service.ts:204`) sin ruta montada.
7. La suite ya pinnea el comportamiento: 20+ archivos de integración (`receipts-*`, `platform-receipts-*`, `subscriptions-*`, `platform-subscriptions-compensation`) + unit de `packages/shared/tests/documents/`. **Es la red de seguridad del refactor.**

## Decisiones congeladas (no re-discutir por fase)

- **Se preserva el contrato público al 100 %**: mismos factories y métodos, mismos `ReceiptError.code`/`status`, mismo `ReceiptRenderEvent`, mismas keys R2, mismos gates `WHERE ... IS NULL`, mismos tipos de email y mismos TTLs del sweep. Los consumidores (rutas, console, panel) no se tocan.
- **El adapter parametriza, no abstrae de más**: ≤ ~11 estrategias por perfil, cada una ≤ 5 líneas. Si el core queda *más* difícil de leer que la duplicación, el refactor falla aunque compile.
- **Orden crítico intocable**: perfil fiscal + snapshot + desglose de impuestos se calculan **antes** de consumir la secuencia (un número consumido nunca se reutiliza; un fallo previo no debe quemar correlativo).
- **Idempotencia intocable**: `attachReceipt` con `WHERE receipt_number IS NULL`; el número del evento es el **persistido**, no el local.
- **Compensación intocable**: `lib/subscription-compensation.ts` no se modifica.
- **Sin cambios de BD, colas, DLQ ni Terraform.**
- **Fase 4 (repos) es condicional**: se ejecuta solo si el adapter de tabla reduce líneas sin degradar los tipos de Drizzle; si no, se cierra como "evaluado y descartado" documentado.

## Contrato congelado (verificable en review)

| Contrato | Forma exacta que NO cambia |
| --- | --- |
| Paso 1 Panel | `createReceiptsService(db, receiptQueue, taskQueue?)` → `assignReceiptNumber({ orgId, paymentId, timezone, orgSlug?, taxOverride?, actor? })`, `getReceiptState(orgId, paymentId)`, `markReceiptVoided({ orgId, paymentId, by, reason })`, `sendReceiptEmail(orgId, paymentId)` |
| Paso 1 Console | `createPlatformReceiptsService(db, receiptQueue, taskQueue?)` → `assignPlatformReceiptNumber({ paymentId, payerEmail?, payerName?, actor? })`, `setPayerIfMissing`, `getPlatformReceiptState(paymentId)`, `markPlatformReceiptVoided`, `resendPlatformReceiptEmail(paymentId)` |
| Errores | `PAYMENT_NOT_FOUND`(404), `NOT_VALIDATED`(409), `RECEIPT_NOT_ISSUED`(409), `ORG_NOT_FOUND`(404), `ORG_SLUG_MISSING`(500), `TIMEZONE_MISSING`(500), `RECEIPT_INCOHERENT`(500), `TAX_OVERRIDE_REASON_REQUIRED`(400), `TAX_MISMATCH`(400), `TAXES_REQUIRE_FORMAL_TAXPAYER`(400), `FISCAL_PROFILE_UNKNOWN`(500), `ACTOR_REQUIRED`(400), `MEMBER_EMAIL_MISSING`(422), `PAYER_EMAIL_MISSING`(422), `QUEUE_MISSING`(500), `RECEIPT_VOIDED`(409) |
| Evento | `ReceiptRenderEvent = { type:'receipt.render', scope:'panel'\|'platform', paymentId, organizationId, receiptNumber }` vía `buildReceiptRenderEvent` |
| Keys R2 | `receipts/<slug>/<year>/<num>.pdf` · `...-anulado.pdf` · `platform/receipts/<year>/<num>.pdf` · `...-anulado.pdf` |
| Gates BD | `completeReceiptPdf`/`completeVoidedReceiptPdf`/`markReceiptNotified` (y gemelos) con `WHERE ... IS NULL RETURNING` |
| Emails | `email.payment_receipt` (Panel, miembro) · `email.org_payment_received` (Console, payer + owners) |
| Sweep | 3 predicados, umbrales 15/30/15 min, `LIMIT 50` |

## Arquitectura objetivo

Dos **perfiles** implementan un **core único** por etapa. El core vive en el app (necesita repos con I/O); los **tipos** de los perfiles son estructurales y viven donde se consumen (api-worker / jobs-worker), sin imports cruzados entre apps.

```ts
// apps/api-worker/src/lib/receipt-emission.ts (nuevo)

export interface EmissionContext {
  paymentId: number;
  orgId: string | null;        // Panel: org de sesión. Platform: null.
  orgSlug: string | null;      // Panel: slug. Platform: null.
  timezone: string | null;     // Panel: tz de la org. Platform: null.
  actor: string | null;
  taxOverride: TaxOverrideInput | null; // Panel. Platform: siempre null.
  payer: { email: string; name: string } | null; // Platform. Panel: null.
}

export interface ReceiptEmissionProfile {
  scope: 'panel' | 'platform';

  loadPayment(ctx: EmissionContext): Promise<EmissionPayment | null>;
  /** Valida estado y decide skip por $0 (solo platform). */
  inspect(payment: EmissionPayment): { skip: true } | { skip: false; amountPaid: number };
  /** Carga la configuración del emisor UNA vez (org, slug, settings). */
  loadEmitter(payment: EmissionPayment): Promise<EmitterContext>;
  resolveFiscalProfile(emitter: EmitterContext): FiscalProfile;
  buildEmitterSnapshot(emitter: EmitterContext, profile: FiscalProfile): ReceiptEmitterSnapshot;
  resolveTaxBreakdown(amountPaid: number, profile: FiscalProfile, currencyPaid: string,
                      taxOverride: TaxOverrideInput | null): TaxBreakdown;
  nextNumber(input: { orgId: string | null; emitter: EmitterContext; timezone: string | null }):
    Promise<{ seq: number; year: number | null; receiptNumber: string }>;
  assertGeneratedNumber(number: string, seq: number, year: number | null, emitter: EmitterContext): boolean;
  beforeAttach?(ctx: EmissionContext): Promise<void>;   // platform: setPayerIfMissing
  attach(ctx: EmissionContext, input: AttachInput): Promise<AttachedRow>;
  releaseNumber(input: { orgId: string | null; year: number | null; seq: number }): Promise<{ released: boolean }>;
  buildEvent(paymentId: number, orgId: string, receiptNumber: string): ReceiptRenderEvent;
}

export function createReceiptEmissionService(
  db: Db,
  queues: { receiptQueue: Queue; taskQueue?: Queue },
  profile: ReceiptEmissionProfile,
) { /* core: secuencia de 12 pasos, idéntica a hoy */ }
```

El **core** ejecuta la secuencia hoy duplicada; los perfiles son:

- `createReceiptsService(db, receiptQueue, taskQueue)` → `createReceiptEmissionService(db, …, panelProfile(db, receiptQueue, taskQueue))` + métodos de estado/void/email. **Firma pública intacta.**
- `createPlatformReceiptsService(db, receiptQueue, taskQueue)` → igual con `platformProfile(db, …)`. **Firma pública intacta.**

Paso 2, espejo en jobs-worker:

```ts
// apps/jobs-worker/src/handlers/receipt-profile.ts (nuevo)
export interface ReceiptRenderProfile {
  scope: 'panel' | 'platform';
  loadComposed(event: ReceiptRenderEvent): Promise<Composed | null>;
  compose(composed: Composed, persistedNumber: string): ReceiptData;
  r2Year(composed: Composed, receiptNumber: string): number;  // panel: año local del número; platform: year UTC de receiptIssuedAt
  keys: { emission(year: number, number: string): string; voided(year: number, number: string): string };
  completePdf(paymentId: number, key: string): Promise<{ completed: boolean }>;
  completeVoidedPdf(paymentId: number, key: string): Promise<{ completed: boolean }>;
  notifyGate(paymentId: number): Promise<{ completed: boolean }>;
  clearNotify(paymentId: number): Promise<void>;
  dispatchNotification(ctx: { paymentId: number; orgId: string; composed: Composed }): Promise<boolean>;
}

export async function handleReceiptRender(env, event): Promise<'completed' | 'already-done'> {
  const profile = event.scope === 'platform' ? platformRenderProfile(env) : panelRenderProfile(env);
  // core: load → voidedPdfPending → early-return → render (emisión|anulado) → notify
}
```

`handleReceiptRender` conserva el nombre exportado (lo llama `index.ts`); `handlePlatformReceiptRender` puede quedar como delegación interna o eliminarse si nadie más lo importa.

## Orden de ejecución

```
fase-0 (línea base) ──▶ fase-1 (compose único, shared) ──┬──▶ fase-2 (paso 2 jobs-worker)
                                                          └──▶ fase-3 (paso 1 api-worker)
                                                          └──▶ fase-6 (limpieza)
                                                          └──▶ fase-5 (adjunto email, opcional)
                                    fase-4 (repos, condicional) ◀── depende de fase-3
                                    fase-7 (docs + verificación global) ◀── requiere 1–3 y 6
```

| Fase | Archivo | Requiere | Resultado | Commit sugerido |
| --- | --- | --- | --- | --- |
| 0 | `phases/fase-0-linea-base.md` | — | Conteos LOC + matriz verde registrada | `chore(receipts): baseline before unifying the emission engine` |
| 1 | `phases/fase-1-compose-unico.md` | fase-0 | 1 core de compose + 2 mappers compartidos | `refactor(shared): one receipt composer for both issuers` |
| 3 | `phases/fase-3-paso-1-adapter.md` | fase-1 | Core de emisión + 2 perfiles | `refactor(api-worker): parameterize the emission step with an issuer profile` |
| 2 | `phases/fase-2-paso-2-adapter.md` | fase-1 (+3 opcional) | Core de render/notify + 2 perfiles | `refactor(jobs-worker): one render/notify core for both issuers` |
| 4 | `phases/fase-4-repos-condicional.md` | fase-3 | Decisión sobre repos (unificar o descartar) | `refactor(database): evaluate the shared receipt table adapter` |
| 5 | `phases/fase-5-email-adjunto.md` | fase-2 | Resolución de adjunto compartida | `refactor(jobs-worker): share the R2 receipt attachment resolver` |
| 6 | `phases/fase-6-limpieza.md` | fase-0 | Código muerto eliminado + `change-plan` resuelto | `chore(receipts): remove dead template and resolve the unmounted change-plan` |
| 7 | `phases/fase-7-docs-verificacion.md` | 1–6 | Docs + matriz completa | `docs: document the unified receipt engine` |

Fase-1 desbloquea 2, 3 y 6 en paralelo. Fase-4 solo tiene sentido tras fase-3 y puede descartarse.

## Detalle por fase

### Fase 0 — Línea base (sin cambios de código)

1. Registrar LOC de los 8 archivos del inventario (`wc -l`) y el resultado de `pnpm test` (nº de tests por paquete: shared / api-worker / jobs-worker / panel / console).
2. Corre **TODA** la matriz de integración por archivo completo (caveat de vitest: pasar la ruta completa, los filtros son substrings OR-eados):
   `receipts-{emission,sequence,snapshot,voided-pdf,integrity,rbac}`, `platform-receipts-{emission,sequence,snapshot,void,report,contract}`, `subscriptions`, `subscriptions-period`, `subscriptions-compensation`, `platform-subscriptions-compensation`, `platform-subscription-status`, `org-billing`.
3. Guardar los conteos. Son la definición de "no rompí nada".

### Fase 1 — Compose único en `packages/shared` (menor riesgo, mayor desduplicación)

**Objetivo**: 1 core de armado + 1 mapper por emisor; eliminar 4 copias.

1. Nuevo módulo `packages/shared/src/documents/receipt-compose-mappers.ts` (puro, edge-safe):
   - `toPanelComposeInput(rows, persistedNumber): ComposeReceiptInput`
   - `toPlatformComposeInput(rows, persistedNumber): PlatformComposeReceiptInput`
   - Tipos estructurales propios (NO importa `@workspace/database`; evita el ciclo shared→database). Campos `bigint` llegan como `string | number` y se normalizan con `Number()` dentro del mapper (mismo `Number(...)` que hoy hacen los 4 callers).
   - Usar los mappers desde: `apps/jobs-worker/src/handlers/receipt.handler.ts` (`buildComposeInput`, `buildPlatformComposeInput`) y desde los `getReceiptState`/`getPlatformReceiptState` de los dos servicios.
2. Factorizar el tronco común de `buildReceiptDataFromComposed` / `buildPlatformReceiptDataFromComposed`:
   - Extraer un `assembleReceiptData(neutral): ReceiptData` privado con el bloque idéntico: `document`, `amounts` (incl. `toBaseTotal`), `method` (masking + `toReceiptMaskedDetails`), `footer`.
   - Dejar en cada builder solo lo que difiere: identidad del emisor (snapshot), receptor, periodo, `baseCurrency` y `type` (Panel puede `invoice`; Console siempre `receipt`).
3. Exportar lo nuevo desde `documents/index.ts`.
4. **Test de equivalencia** (nuevo, `packages/shared/tests/documents/receipt-compose-parity.test.ts`): para un set de fixtures (pago simple, multimoneda, anulado, snapshot presente, snapshot `NULL`, miembro `null`, sin suscripción) la nueva ruta produce `ReceiptData` **idéntico** (`toEqual`) al esperado, en ambos emisores. Estas fixtures se derivan de los casos ya cubiertos por la integración.

**Riesgo**: bajo. Cambio puro, sin I/O, cubierto por unit nuevos + los existentes.

### Fase 3 — Core de paso 1 (`apps/api-worker`)

**Objetivo**: 1 orquestador; `receipts.service.ts` y `platform-receipts.service.ts` bajan a ~150 líneas (perfil + métodos de estado/void/email).

1. Crear `apps/api-worker/src/lib/receipt-emission.ts` con `ReceiptEmissionProfile` y `createReceiptEmissionService`.
2. Mover **literalmente** la secuencia de `assignReceiptNumber` al core; cada punto divergente se sustituye por la estrategia correspondiente. **No reordenar pasos.**
3. Escribir `panelProfile` y `platformProfile` (los cuerpos son las líneas hoy duplicadas, extraídas tal cual):
   - Panel: carga con `paymentsRepo.findById(orgId, id)`; `resolveFiscalProfile(countryCode, fiscalConfig)`; `buildEmitterSnapshot(org, profile)`; override de impuestos; `receiptsRepo.nextDocumentNumber(orgId,'receipt',year)` + `formatPanelReceiptNumber` + `parsePanelReceiptNumber`; validación previa `formatPanelReceiptNumber(slug, year, 1)`; `receiptsRepo.attachReceipt(id, orgId, input)`; `releaseLastNumber(orgId,'receipt',year,seq)`; `buildReceiptRenderEvent` sin scope.
   - Platform: carga con `platformSubsRepo.findPaymentById(id)`; `amountPaid === 0` → `skip`; `resolveFiscalProfile(countryCode)`; `buildPlatformEmitterSnapshot({ receptor, emitter: platformEmitterFromSettings(settings), currency }, profile)`; sin override; `platformReceiptsRepo.nextPlatformDocumentNumber('receipt')` + `formatConsoleReceiptNumber` + `parseConsoleReceiptNumber`; `beforeAttach` = `setPayerIfMissing`; `attachPlatformReceipt(id, input)`; `releaseLastPlatformNumber('receipt', seq)`; evento con `scope:'platform'`.
4. `createReceiptsService` / `createPlatformReceiptsService` conservan **exactamente** su firma y devuelven lo mismo; internamente delegan. `getReceiptState`, `markReceiptVoided`, `sendReceiptEmail` (y gemelos) permanecen en el wrapper usando los mappers de fase-1.
5. Conservar todo `console.log` de trazabilidad (FS-0005 los añadió; el core loguea una vez, sin perder mensajes ni datos).

**Riesgo**: medio. Mitigado por la red de integración y por no tocar orden ni contratos.

### Fase 2 — Core de paso 2 (`apps/jobs-worker`)

1. Nuevo `apps/jobs-worker/src/handlers/receipt-profile.ts` con `ReceiptRenderProfile` + `panelRenderProfile(env)` / `platformRenderProfile(env)`.
2. `handleReceiptRender` pasa a seleccionar perfil por `event.scope` y ejecutar el core (misma secuencia: `loadComposed` → `voidedPdfPending` → early-return → render emisión/anulado → `notifyGate` → `dispatchNotification` → outcome). Se conserva el log de número divergente persistido.
3. `renderAndStoreReceiptPdf` se generaliza: compone vía perfil, `checklistPrePdf`, resuelve `key` por perfil, import lazy de `../receipt-pdf`, `PUT` a R2, `completePdf`/`completeVoidedPdf` por perfil.
4. `dispatchReceiptNotification` se generaliza: `notifyGate` → encolar el email del perfil → `clearNotify` y re-throw si falla.
5. `sweepPendingReceiptPdfs` **no cambia** (ya es genérico por tabla).

**Riesgo**: medio. El out-queue de emails y el gate de notificación son los puntos sensibles; los tests `receipts-voided-pdf`, `platform-receipts-void` y `platform-receipts-contract` los pinnean.

### Fase 4 — Repos compartidos con adapter de tabla (CONDICIONAL)

1. Sketch: `createDocumentReceiptsRepository(db, tableAdapter)` donde el adapter declara `{ table, sequenceTable, scope:'org'|'global', columns }`. Los métodos son idénticos salvo el scoping.
2. **Puerta de decisión**: si el tipado de Drizzle con dos tablas distintas obliga a `as any`/genéricos que empeoran la legibilidad, **no se hace**. Se documenta el descarte en `phases/fase-4-repos-condicional.md` y se mantienen los dos repos (la excepción consciente de AGENTS §1 sigue vigente).
3. Si se hace, la sentencia atómica y los `WHERE ... IS NULL` deben quedar idénticos y los tests `receipts-sequence` / `platform-receipts-sequence` deben pasar sin edición.

### Fase 5 — Adjunto de email compartido (opcional)

- `pdf.handler.ts` ya tiene `resolveOrgReceiptAttachment`; extraer `resolveReceiptAttachmentPdf(env, paymentId, receiptNumber, receiptPdfKey): Promise<{ ok:true; attachments } | { ok:false }>` y usarla también en `handlePaymentReceipt` (hoy duplica la lectura de R2 y los 3 `console.error`). Sin cambio de ramas ni de mensajes.

### Fase 6 — Limpieza (independiente)

1. Borrar `apps/jobs-worker/src/templates/payment-receipt.ts` (código muerto; verificar antes con `rg "renderPaymentReceipt\b"` que solo aparezca en docs).
2. Eliminar el bloque `if (!isTrial && plan.price === 0) { /* … */ }` vacío de `platform-subscriptions.service.ts`.
3. `change-plan`: **montar** `POST /api/platform/subscriptions/change-plan` (ya existe `changePlanSchema` en `platform-subscriptions.route.ts` y el servicio `changePlan`) o **retirar** la llamada del console. Decisión en `phases/fase-6-limpieza.md`; lo mínimo es alinear ambos lados (hoy el console llama a algo inexistente).
4. (Nit, no bloqueante) Unificar `classifyReceiptState` con el filtro `issued` del repo: una única expresión documentada. Si tocar el SQL arriesga el reporte, dejar solo un test de paridad entre ambos.

### Fase 7 — Docs y verificación global

- `AGENTS.md`: sección "Payment Receipts" — sustituir la descripción "mirror" por "core + perfiles" y actualizar el inventario de archivos.
- `apps/api-worker/README.md` / `apps/jobs-worker/README.md` si describen el flujo de pasos.
- `phases/README.md` con el estado final.

## Tests

- **Nuevos (unit, shared)**: paridad del compose por emisor (Fase 1); el resto de la lógica pura no cambia.
- **Nuevos (unit, api-worker)**: un test del core de emisión con repos falsos (dobles) que verifique el **orden** de llamadas (impuestos antes de `nextNumber`; `attach` antes de `release`). No existía y es el corazón del refactor.
- **Nuevos (integración, api-worker)**: solo si aparece un hueco; el objetivo es **no añadir** integración nueva porque la existente ya cubre el comportamiento.
- **Sin editar** los tests existentes. Cualquier edición obligatoria → revisar si el refactor cambió semántica.
- **E2E**: el flujo de comprobantes del panel (`e2e/panel/subscriptions.spec.ts`) y el seed deben seguir verdes sin cambios.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
| --- | --- |
| Deriva de códigos de error o de shape de evento | Tabla "Contrato congelado" chequeada en review; `pnpm typecheck` obliga a respetar los tipos de `ReceiptRenderEvent` |
| Reordenar el cálculo fiscal respecto de la secuencia | Test de orden con repos dobles (Fase 3) + comentario de orden en el core |
| Doble email o doble render por un gate mal unificado | Conservar `WHERE ... IS NULL` y `markReceiptNotified`; tests `receipts-voided-pdf` / `platform-receipts-void` |
| El adapter se vuelve una indirección peor | Límite de ≤11 estrategias/perfil y ≤5 líneas cada una; si no se cumple, parar |
| Fase 4 rompe tipos/legibilidad | Puerta de decisión explícita; puede descartarse sin coste |
| Cambios en `console` por `change-plan` | Resolver en Fase 6 como unidad atómica (ruta + cliente) |

## Verificación global (Fase 7)

| # | Comando | Esperado |
| --- | --- | --- |
| 1 | `pnpm typecheck` | 9/9 OK |
| 2 | `pnpm lint` | 0 errores |
| 3 | `pnpm test` | shared + api-worker + jobs-worker + panel + console; integración contra rama Neon (`TEST_DATABASE_URL`), `describe.skipIf` si falta |
| 4 | integración por archivo completo | `receipts-*` y `platform-receipts-*` verdes **sin editar**; `subscriptions*` y compensación también |
| 5 | `pnpm db:check` | sin drift (no hay cambios de esquema) |
| 6 | E2E opcional | `pnpm test:e2e:panel` si `apps/panel/.env` existe |

**Criterio de done**: contrato congelado intacto · tests existentes sin editar y verdes · paridad del compose en unit · reducción neta ≥1.500 líneas en el motor · código muerto eliminado · `change-plan` coherente.

## Fuera de alcance (documentado)

- Rediseño del modelo `payment.status` vs `receipt_voided` (dos fuentes de verdad) → `vaults/backlog/`.
- Refactor del orden no atómico del void multi-paso → task aparte.
- Cambios de esquema, colas, Terraform o contratos HTTP.

# Correcciones del track Comprobantes — plan de ejecución

> Derivado de la revisión de `plan.md`, `tasks/fase-*.md`, `docs/FACTURATION.md`, `docs/PENDING.md` y el código real (shared `documents/`, repos compartidos, paso 1, paso 2, PDF, rutas, UI, tests).
> Estado verificado al escribir este plan: `pnpm typecheck` ✅ 9/9 · `@workspace/shared` tests ✅ 244/244.
> **No se implementa nada hasta aprobación explícita** (AGENTS.md §7). Las migraciones requieren aprobación aparte.

---

## 0. Resumen ejecutivo

| # | Fase | Naturaleza | Migración | Severidad | Esfuerzo | Estado |
|---|---|---|---|---|---|---|
| C0 | Integridad del correlativo (orden + carrera) | Bug | No | 🔴 Bloqueante | S | ✅ Hecha |
| C8 | Guardado de organización org-scoped en Panel (D5) | Bug | No | 🔴 Bloqueante | S | ✅ Hecha |
| C1 | Snapshot del emisor (registro inmutable) | Bug fiscal | Sí (0016) | 🔴 Bloqueante | M | ✅ Hecha |
| C2 | Perfil fiscal conservador (`isFormalTaxpayer`, IGTF) | Correctitud fiscal | No | 🟠 Alta | M | ✅ Hecha |
| C3 | Fidelidad del PDF (placeholders, equivalente en moneda base) | Correctitud | No | 🟠 Alta | S | ✅ Hecha |
| C4 | Auditoría espejo en Console (`FS-N` + export) | Hueco funcional | No | 🟠 Alta | M | ✅ Hecha |
| C5 | Trazabilidad de emisión (`issued_by`) | Auditoría | Sí (0016) | 🟡 Media | S | ✅ Hecha |
| C6 | Robustez de barrido y contrato de anulación | Robustez | No | 🟡 Media | S | ✅ Hecha |
| C7 | Higiene, docs y matriz de tests | Deuda | No | 🟡 Media | S | ✅ Hecha |
| C9 | Estados reales (ANULADA ≠ CANCELADA) + registro no eliminable | Correctitud de modelo | No | 🟠 Alta | S | ✅ Hecha |

**C0 + C8 + C2 + C3 + C4 cierran el objetivo de "registro correcto + bases listas para homologar" sin tocar la DB.**
**C1 + C5** (una sola migración, `0016`, aditiva y sin backfill) cierran el otro requisito duro: **comprobante reproducible + emisor identificado**.

Decisiones D1–D6 **resueltas** al final del documento (sección *Decisiones congeladas*).

Regla de siempre: `pnpm db:generate → review → migrate` con aprobación; **prohibido `db:push`**.

---

## C0 — Integridad del correlativo 🔴 (sin migración)

### Problema

1. **Orden invertido en el paso 1 del Panel.** `apps/api-worker/src/services/receipts.service.ts` consume la secuencia (`nextDocumentNumber`) **antes** de `resolveFiscalProfile()` y `computeInclusiveTaxes()`. Ambos pueden lanzar por diseño:
   - `resolveFiscalProfile` → `countryCode` desconocido (error visible, sin fallback).
   - `computeInclusiveTaxes` → base no entera/negativa.
   Resultado: **el número se quema y nunca se adjunta** → hueco permanente e inexplicado en `gaps[]`, y cada clic en `POST /:id/issue` quema otro. Console sí hace el orden correcto (calcula impuestos antes de `nextPlatformDocumentNumber`) — la asimetría no es intencional.
2. **Carrera de doble emisión.** Dos PATCH concurrentes a `validated` pasan ambos el guard `previous.status !== VALIDATED`, ambos consumen secuencia; el perdedor de `WHERE receipt_number IS NULL` relee la fila (idempotencia ✅) pero **su número queda quemado**.

### Cambios

| Archivo | Cambio |
|---|---|
| `apps/api-worker/src/services/receipts.service.ts` | (a) Resolver `orgSlug` + `year` + validar forma del slug **y** calcular perfil fiscal/impuestos **antes** de `nextDocumentNumber`. (b) Re-leer el pago justo antes de consumir la secuencia (guarda tardía de "ya numerado" → early return sin quemar). (c) Si `attachReceipt` pierde la carrera (`persistedNumber !== receiptNumber`), llamar a la compensación. |
| `packages/database/src/repositories/receipts.repository.ts` | Nuevo `releaseLastNumber(orgId, type, year, seq)`: `UPDATE … SET last_number = last_number - 1 WHERE … AND last_number = $seq`. Solo revierte si eres el último consumidor (nunca reordena números ya emitidos). |
| `apps/api-worker/src/services/platform-receipts.service.ts` | Mismo par (b)+(c) por simetría; el orden (a) ya es correcto. Nuevo `releaseLastPlatformNumber(seq)` con `AND next_number = $seq`. |
| `packages/database/src/repositories/platform-receipts.repository.ts` | `releaseLastPlatformNumber`. |

### Límite honesto de C0

La compensación cierra el caso "el perdedor es el último consumidor". En una carrera de 2 donde **el ganador tiene el seq menor**, el número menor es irreclaimable sin renumerar (prohibido). Eso se documenta en `plan.md` como riesgo residual aceptado (probabilidad ~0 con la guarda tardía (b), que reduce la ventana a milisegundos).

### Decisión D4 (congelada)

Se aplica **C0 pragmático** (orden + guarda tardía + compensación) y *claim-then-number* queda **documentado en `docs/PENDING.md`** con disparador explícito: *si el reporte de huecos muestra un hueco no explicado en producción*. No se incluye en la migración de C1/C5 para mantenerla revisable y evitar un estado intermedio nuevo (`reclamado sin número`) que obligaría a una rama extra de reparación en el barrido.

Referencia de la alternativa completa: reclamar el pago con `UPDATE … WHERE receipt_number IS NULL RETURNING id` (persistiendo ya los impuestos) **antes** de consumir la secuencia y asignar el número después.

### Criterios de aceptación (verificados)

- ✅ `tests/integration/receipts-integrity.test.ts` — org con `countryCode` inválido → la emisión falla y la secuencia **no cambia**; `gaps[]` **vacío**.
- ✅ `tests/integration/receipts-integrity.test.ts` — doble emisión concurrente del mismo pago → **un** número persistido, ambos responses devuelven el número autoritativo.
- ✅ `receipts-integrity.test.ts` — `releaseLastNumber`/`releaseLastPlatformNumber` liberan solo si siguen siendo el último consumidor (y el número liberado se **reutiliza**).

### Implementación

- `packages/database/src/repositories/receipts.repository.ts` → `releaseLastNumber`.
- `packages/database/src/repositories/platform-receipts.repository.ts` → `releaseLastPlatformNumber`.
- `apps/api-worker/src/services/receipts.service.ts` → slug/año validados + perfil fiscal e impuestos **antes** de `nextDocumentNumber`; guarda tardía (`fresh`); helper `requeueRenderIfPdfPending`; compensación y `pdfStatus` real.
- `apps/api-worker/src/services/platform-receipts.service.ts` → guarda tardía, compensación y `PlatformAssignResult.pdfStatus: 'pending' | 'ready'`.

---

## C8 — Guardado de la organización org-scoped en Panel (D5) 🔴 (sin migración)

### Problema

`apps/panel/lib/services/organizations-service.ts` apunta a `/platform/organizations` (`ORGANIZATIONS_PATH`), y `PATCH /platform/organizations/:id` exige `requirePlatformAuth()` (= permiso de plataforma `organization.create`, `apps/api-worker/src/lib/route-handler.ts`). El formulario **general** de `settings/organization` (`handleSave`) usa ese service → un OWNER/MANAGER de gym real recibe **403**, atrapado por el `catch` genérico ("No se pudo guardar la información"). No se detecta en dev/E2E porque la cuenta del desarrollador sí tiene rol de plataforma, y el E2E solo prueba "Guardar facturación" (que sí usa el endpoint org-scoped).

Riesgo añadido: ambos guardados escriben la misma fila `organization`. El merge de `fiscalConfig` ya está bien resuelto ✅ (no hay reescritura ciega), pero el bug deja el módulo de identidad de sede roto en producción y viola AGENTS.md §5 ("platform-scoped logic lives in console-specific services").

### Cambios

| Archivo | Cambio |
|---|---|
| `apps/panel/lib/services/organizations-service.ts` | Apuntar a `/organizations/profile` (org-scoped) o retirar `update` y usar `authClient.organization.update()` (AGENTS.md §5: Better Auth es la fuente de verdad de name/logo). Cero rutas `/platform/*` desde el panel. |
| `apps/panel/app/(protected)/settings/organization/page.tsx` | `handleSave` usa el service org-scoped; errores vía `mutationError(scope, err, "No se pudo guardar la información")` (nunca texto crudo) + `updateTag` + `router.refresh()`, igual que el bloque fiscal. |
| `apps/api-worker/src/routes/organizations.route.ts` | Verificar que `PATCH /profile` acepta el set completo (`name`, `slug`, `logo`, `slogan`, `address`, `timezone`, `currencyFormat`) con `requireOrgPermission(ORGANIZATION, UPDATE)`; `countryCode`/`primaryCurrency` siguen inmutables (400). |
| `e2e/panel/settings.spec.ts` | **Nuevo test**: guardar el formulario general → sin toast de error + persistencia tras `router.refresh()`. Este test habría detectado el 403. |

### Criterios de aceptación (verificados)

- ✅ E2E `e2e/panel/settings.spec.ts` → "guarda los datos generales de la sede (endpoint org-scoped)": toast de éxito + valor persistido tras reload.
- ✅ Integración `organizations-fiscal.test.ts` → set general persistido (name/slogan/logo/timezone/currencyFormat/legalName/taxId/address) y slug duplicado → **409 `SLUG_TAKEN`**.
- ✅ Grep: `organizations-service.ts` (panel) ya no expone `update` ni se usa desde el formulario; queda solo `getAll`/`getById`/`join`.

### Implementación

- `apps/api-worker/src/routes/organizations.route.ts` → `orgProfileSchema` acepta el set general y el handler lo aplica (sigue rechazando `countryCode`/`primaryCurrency` con 400).
- `apps/panel/lib/services/org-profile-service.ts` → `OrgProfileInput` (general + fiscal) y único punto de escritura de `organization` en el panel.
- `apps/panel/app/(protected)/settings/organization/page.tsx` → `handleSave` org-scoped, vacíos → `null`, `mutationError`; país **read-only** (con motivo); `taxId` deja de ser `required` (bloqueaba el submit nativo del formulario).
- `packages/ui/src/components/country-selector.tsx` → prop `disabled` (read-only).
- `apps/api-worker/src/lib/errors.ts` → el `onError` respeta `err.res` de un `HTTPException`: sin esto el `code: 'SLUG_TAKEN'` documentado en AGENTS.md **nunca llegaba** al cliente (bug encontrado al escribir el test de C8).

---

## C1 — Snapshot del emisor 🔴 (migración única con C5) ✅

### Problema

`GET /:id/receipt` **recompone desde filas vivas**: `organization.legalName`, `taxId`, `address`, `countryCode`, `fiscalConfig` (→ disclaimer y perfil fiscal), nombre del plan (este sí tiene snapshot ✅). El PDF en R2 es inmutable, pero el JSON y la auditoría **divergen** del documento emitido en cuanto el gym edita su perfil. Para SENIAT/DIAN el emisor del documento es el del momento de emisión: hoy el registro no es reproducible.

### Cambios

| Archivo | Cambio |
|---|---|
| `packages/database/src/schema.ts` | `payment.emitterSnapshot` jsonb + `platform_subscription_payment.emitterSnapshot` jsonb (nullable; `NULL` = emitido antes del snapshot → fallback al compose vivo, estado terminal documentado). |
| `packages/database/src/repositories/receipts.repository.ts` | `attachReceipt` acepta y persiste `emitterSnapshot`. |
| `packages/database/src/repositories/platform-receipts.repository.ts` | `attachPlatformReceipt` idem. |
| `packages/shared/src/documents/receipt-compose.ts` | `buildEmitterSnapshot()` (puro) + `buildReceiptDataFromComposed` / `buildPlatformReceiptDataFromComposed` leen el snapshot si existe; si no, compose vivo (legacy). |
| `apps/api-worker/src/services/receipts.service.ts` · `platform-receipts.service.ts` | Construyen el snapshot en el paso 1 y lo pasan a `attach*Receipt`. |
| `apps/api-worker/src/services/reports.service.ts` | Expone el emisor congelado en la fila del reporte (necesario para export/libro). |

**Contenido del snapshot** (congelado, nada derivable en vivo): `name`, `legalName`, `taxId`, `taxLabel`, `address`, `countryCode`, `currency`, `label` aplicada por el gate, `disclaimer[]`, `docLabel` del receptor y el perfil fiscal resuelto (`taxes[]` con `name/rate/enabled`) con el que se calcularon los impuestos.

### Criterios de aceptación (verificados)

- ✅ Integración `receipts-snapshot.test.ts`: emitir → cambiar `legalName`/`taxId`/`address`/`countryCode`/`fiscalConfig` de la org → `GET /:id/receipt` devuelve **idéntico** (`receipt.emitter`, `footer.disclaimer`, `document.label`, `recipient.docLabel`), con sanity check de que la fila viva sí cambió.
- ✅ Integración `platform-receipts-snapshot.test.ts`: mismo contrato para el emisor FitStack (cambian `platform_setting` y el país del receptor → comprobante intacto).
- ✅ Integración: pago legacy (`emitter_snapshot = NULL`) sigue componiendo en vivo sin romper (contrato de 3 estados intacto).
- ✅ El flag ANULADO sigue siendo la **única** mutación posterior permitida (no forma parte de la identidad).

### Implementación

- Migración `0016_neat_the_twelve.sql` (aditiva, nullable, sin backfill): `payment.emitter_snapshot` jsonb + `payment.issued_by` text + las dos gemelas en `platform_subscription_payment`.
- `packages/shared/src/documents/receipt-data.ts` → `ReceiptEmitterSnapshot` + `ReceiptSnapshotTax` (contrato del jsonb).
- `packages/shared/src/documents/receipt-compose.ts` → `buildEmitterSnapshot` (Panel), `buildPlatformEmitterSnapshot` + `platformEmitterFromSettings` (Console), `assertEmitterSnapshot` (lectura fail-closed) y `summarizeTaxes`. Los dos compose leen el snapshot **primero** y no evalúan la configuración viva si existe.
- Paso 1 Panel (`receipts.service.ts`) y Console (`platform-receipts.service.ts`): construyen el snapshot **antes** de consumir la secuencia y lo persisten junto al número.
- Paso 2 (jobs-worker) y `GET /:id/receipt` de ambas apps: pasan `emitterSnapshot` al compose.

### Criterios de aceptación (C5, verificados)

- ✅ Integración: alta con pago validado → `issued_by` = usuario de sesión; `POST /:id/issue` idem.
- ✅ Integración: paso 2 / re-entrega sin sesión → `issued_by` y `emitter_snapshot` **intactos** (nunca un actor inventado; el barrido solo re-encola render, no numera).

### Implementación (C5)

- `issuedBy` viaja por `ReceiptContext.by` / `PlatformReceiptContext.by` desde `c.get('user')?.id` en las 6 rutas que numeran (Panel: alta, `PATCH /payments/:id/status`, `POST /:id/issue`; Console: alta, renovación, alta de pago, `PATCH .../status`).
- Repos compartidos: `attachReceipt` / `attachPlatformReceipt` aceptan `issuedBy` y lo escriben en la misma sentencia que el número.
- Reportes Panel y Console: filas con `issuedBy` + `emitterName` (leído del snapshot) y CSV con las columnas `emisor` / `emitido_por`.

---

## C2 — Perfil fiscal conservador 🟠 (sin migración) ✅

### D1 (congelada) — ¿`isFormalTaxpayer` gobierna el desglose?

**Sí, y no hay desglose para quien no es contribuyente formal.** Un emisor que no es contribuyente formal no puede cobrar ni declarar IVA: detallar "IVA (16 %)" en su comprobante sería **afirmar un hecho fiscal falso**, y el desglose base+impuestos es justo lo que un auditor lee como intención de documento fiscal. Cuando no es formal, el comprobante muestra **el total pagado, sin desglose ni derivados**:

| Estado | Qué se persiste | Qué se imprime | Etiqueta |
|---|---|---|---|
| `isFormalTaxpayer: false` (o ausente) | `taxDetails: []`, `taxTotal: 0`, `subtotal = amountPaid` | **Solo "Total pagado"** (sin subtotal, sin líneas de impuesto) | "Comprobante de pago" |
| `isFormalTaxpayer: true` | Desglose del país, ajustable por override | "Total pagado" + subtotal + líneas (IVA, …) | "Comprobante de pago" (el gate de 3 condiciones sigue exigiendo homologación real para "Factura") |

Se persiste `subtotal = amountPaid / taxTotal = 0 / taxDetails = []` (no `NULL`) porque `buildReceiptDataFromComposed` exige esos campos y el reporte suma por moneda: así el registro queda completo y el checklist de cuadre (`total = subtotal + taxTotal`) sigue cumpliéndose sin casos especiales.

**Invariante fail-closed (D6):** *activar* un impuesto exige `isFormalTaxpayer === true`; *desactivarlo* siempre se respeta. El override solo puede **reducir** carga fiscal, nunca inventarla. Cubre el caso legítimo de un contribuyente formal con actividad exenta (desactiva IVA explícitamente).

### D2 (congelada) — IGTF

VE-only, condicional (`currencyPaid !== 'VES'`) y en la práctica sujeto a que el gym sea sujeto pasivo especial → se apoya en el mismo `isFormalTaxpayer`. Resolución: **activable, apagado por defecto, nunca automático.**

- Nace `enabled: false`; jamás se aplica sola.
- Activarla exige **fricción explícita** (patrón `isFormalTaxpayer`): checkbox "confirmo que verifiqué la tasa vigente con mi contador" + **tasa manual obligatoria**. El `3%` de `COUNTRIES.VE.conditionalTaxes` queda como *referencia documentada*, no como valor efectivo (FACTURATION.md §6: variable por decreto).
- **Base correcta (`basis: 'gross_first'`)**: el IGTF se **extrae primero** del monto cobrado (la ley lo calcula sobre el monto pagado en divisa) y el resto se descompone tax-inclusive con IVA. Ejemplo cobrado 30,90 con IVA 16 % + IGTF 3 %: IGTF = 0,93 · resto 29,97 → base 25,84 + IVA 4,13 · **suma exacta = 30,90** ✅. El modelo aditivo plano actual (`total/(1+Σtasas)`) reparte proporcionalmente sobre la misma base y da montos legalmente distintos: se retira.
- ⚠️ Activar IGTF **cambia la base de IVA** de esas facturas (se extrae antes) → el UI lo advierte explícitamente.
- Ítem obligatorio en `docs/PENDING.md`: confirmar tasa y base con contador antes de encenderla en un gym real.

### Cambios

| Archivo | Cambio |
|---|---|
| `packages/shared/src/documents/fiscal-profile.ts` | (a) `countryTaxes` nacen `enabled: isFormalTaxpayer === true`. (b) Activación de cualquier impuesto requiere `isFormalTaxpayer === true`; desactivar siempre se respeta. (c) `conditionalTaxes` nacen `enabled: false` + exponen `basis: 'gross_first'` y `requiresConfirmation: true`. (d) Normalización defensiva: si la config almacenada tiene impuestos activos sin ser formal, se fuerzan a `false` (config vieja; el error visible se da en la escritura). |
| `packages/shared/src/documents/tax-math.ts` | `computeInclusiveTaxes` aplica primero las líneas `gross_first` (extraídas del total, `roundCents`) y descompone el resto; `isTaxApplicable` mantiene el fail-closed para condiciones desconocidas. `TAX_TOTAL_TOLERANCE` sigue validando el cuadre. |
| `packages/shared/src/types.ts` | `ResolvedTax` gana `basis?` y `requiresConfirmation?` (opcionales, sin romper consumidores). |
| `apps/api-worker/src/routes/organizations.route.ts` + `platform-organizations.route.ts` | 400 **explícito** `TAXES_REQUIRE_FORMAL_TAXPAYER` si el **config fusionado** pide `enabled: true` sin `isFormalTaxpayer: true`. Ojo: validar el resultado del merge, no solo el body entrante (un parcial `{taxes:[…]}` no conoce el `isFormalTaxpayer` almacenado) — ver D6. |
| Panel `settings/organization/page.tsx` + Console `emitter-settings.tsx` | Toggles de impuestos deshabilitados con nota cuando no es formal ("tus comprobantes no detallan impuestos"); IGTF con tasa manual + checkbox de confirmación + aviso de impacto en la base de IVA. |
| `apps/panel/components/payments/tax-block.tsx` | Ajustar copy de `lines.length === 0` para que se lea como caso **normal**, no como error. |

> ⚠️ **Cambio de comportamiento para orgs existentes**: un gym que hoy emite con desglose de IVA y no tiene `isFormalTaxpayer` declarado emitirá **sin desglose** en su siguiente comprobante (los ya emitidos no cambian: son inmutables). Comunicar en las notas de release.

### Criterios de aceptación

- Unit `fiscal-profile.test.ts`: no formal → todos los `countryTaxes` `enabled: false`; formal → `enabled: true`; formal + desactivación explícita → se respeta; config almacenada con impuestos activos sin ser formal → se normaliza a `false`.
- Unit `tax-math.test.ts`: caso IGTF `gross_first` → `subtotal + taxTotal === total` exacto (3090 → 2584 + 413 + 93); sin condiciones cumplidas → sin desglose.
- Integración: gym no formal → `taxDetails: []`, `subtotal === amountPaid`, label "Comprobante de pago"; gym formal → desglose IVA correcto. `PATCH /profile` con `enabled:true` sin ser formal → **400** `TAXES_REQUIRE_FORMAL_TAXPAYER`.
- ✅ Preview del panel y paso 1 dan resultados idénticos (misma función compartida; sin cambios de código en el form de pago).

### Implementación (real)

- `packages/shared/src/documents/fiscal-profile.ts` → `countryTaxes` nacen `enabled: isFormalTaxpayer`; condicionales nacen `enabled: false` + `basis: 'gross_first'` + `requiresConfirmation: true`; **normalización defensiva** al final del resolver (no formal → todo apagado; condicional sin confirmar → apagado). Nuevo campo `FiscalConfigSchema.confirmedTaxes: string[]` (fricción D2 persistida) y helper puro `findFiscalWriteViolation(countryCode, config)`.
- `packages/shared/src/documents/tax-math.ts` → `computeInclusiveTaxes` extrae primero las líneas `gross_first` (`roundCents`) y descompone el resto; lanza si el gross-first supera el total cobrado (nunca inventa números). `TaxInput` gana `basis?`/`requiresConfirmation?` (informativo).
- `apps/api-worker/src/services/organizations.service.ts` → 400 `TAXES_REQUIRE_FORMAL_TAXPAYER` / `TAX_REQUIRES_CONFIRMATION` validando el **config fusionado** (D6) en `createOrganization` y `updateOrganization`; `mergeFiscalConfig` acumula `confirmedTaxes` (una confirmación no se pierde en un PATCH parcial).
- `apps/api-worker/src/services/receipts.service.ts` → el override manual que detalla impuestos con `taxDetails` > 0 queda **prohibido** si el emisor no es formal (400): el override solo puede reducir carga fiscal.
- Panel `settings/organization/page.tsx` → toggles de impuestos gated por la declaración formal (con nota "tu comprobante no detalla impuestos"), impuestos condicionales con **tasa manual + confirmación** y aviso de que cambian la base de los demás; apagar la declaración apaga y desconfirma todo.
- Panel `payments/tax-block.tsx` + `payment-section.tsx` + `subscription-form.tsx` → `emitterIsFormal`: sin declaración formal no hay ajuste manual (el modo efectivo es `auto`) y el copy de "sin impuestos" se lee como caso normal, no como error.
- Console `emitter-settings.tsx` → nota explícita de que los comprobantes `FS-N` no detallan impuestos (no existe storage de `fiscalConfig` para el emisor plataforma; ver `docs/PENDING.md` §9).
- Tests: `fiscal-profile.test.ts` (32) y `tax-math.test.ts` (17) reescritos a la semántica nueva; `receipts-emission.test.ts` T1 (informal → sin desglose) + **T1b** (formal → 300 + 1338 cuadrando 10000); `organizations-fiscal.test.ts` (+3 casos de gating); `platform-receipts-emission.test.ts` T1 (SaaS sin desglose).

### Cambio de comportamiento a comunicar

Un gym que hoy emite con desglose de IVA y **no** tiene `isFormalTaxpayer` declarado emitirá **sin desglose** en su siguiente comprobante (los ya emitidos no cambian: son inmutables). Lo mismo para las suscripciones SaaS (`FS-N`). Para recuperar el desglose: Panel → Configuración de Sede → Facturación → declarar contribuyente formal (con confirmación) y, si aplica IGTF, confirmar la tasa con el contador.

---

## C3 — Fidelidad del PDF y datos del documento 🟠 (sin migración) ✅

### Problemas (contra `docs/FACTURATION.md` §3)

1. `apps/jobs-worker/src/receipt-pdf.tsx` imprime `R.I.F.: ---` cuando falta `taxId` — §3 dice **"omitir la línea si no existe, no inventar"**. Igual para el documento del receptor.
2. Cuando `currencyPaid ≠ primaryCurrency` se muestra solo `Tasa aplicada: {rate} {currencyPaid}` — falta el **equivalente convertido en moneda base**, y el texto de la tasa es ambiguo (el rate es "pagado por unidad base").

### Cambios

| Archivo | Cambio |
|---|---|
| `apps/jobs-worker/src/receipt-pdf.tsx` | (a) Render condicional: la línea de `taxId` y la de documento del receptor solo aparecen si hay valor. (b) Bloque de conversión explícito: `1 {baseCurrency} = {rate} {currencyPaid}` + equivalente del total en moneda base. (c) Sin cambios de estilo (variance enforcement). |
| `packages/shared/src/documents/receipt-compose.ts` | Añadir `baseTotal` (equivalente convertido) a `ReceiptAmounts`, calculado con `roundCents` desde la tasa persistida — **nunca** recalculado a partir de APIs de cambio. |
| `packages/shared/src/documents/receipt-data.ts` | `checklistPrePdf`: nuevo error si un campo visible requerido quedó en placeholder (`'---'`) — el placeholder deja de ser una salida válida. |

### Criterios de aceptación (verificados)

- ✅ Unit `receipt-data.test.ts`: el checklist falla si un campo visible es `'---'` y **acepta** `null` (la vía correcta).
- ✅ Unit `receipt-compose.test.ts` + `platform-receipt-compose.test.ts`: `baseTotal` coherente con `exchangeRateApplied`; `null` cuando las monedas coinciden o falta la tasa.
- ✅ `jobs-worker/tests/receipt-pdf.test.ts`: **verificación automática del texto impreso** (infla los content streams y decodifica los runs hex de `TJ`), en lugar de capturas manuales:
  - (i) con datos → contiene `R.I.F.: …`, `DIRECCIÓN / SEDE…` y `C.I. DEL SOCIO…`;
  - (ii) sin datos → **no** aparece `R.I.F.`/`C.I.`/`---`;
  - (iii) con tasa → `Tasa aplicada: 1 VES = 36.5 USD` + `Equivalente: 3,18 VES`.

### Implementación

- `packages/shared/src/documents/receipt-data.ts` → `ReceiptAmounts.baseTotal` (opcional, centavos enteros) + `MISSING_VALUE_PLACEHOLDER` y helper `placeholderViolations` (identificación fiscal, dirección y documento del receptor); el checklist acumula esos errores junto al resto.
- `packages/shared/src/documents/receipt-compose.ts` → helper puro `toBaseTotal(total, currencyPaid, baseCurrency, rate)`: `null` si la moneda coincide o la tasa falta/no es válida (`roundCents(total / rate)` porque la tasa se lee "1 base = rate pagada"). Lo usan **ambos** composes (Panel y Console).
- `apps/jobs-worker/src/receipt-pdf.tsx` → línea de `taxId` y bloque del emisor/receptor condicionales (se omite la línea, no se inventa), y bloque de conversión `1 {base} = {rate} {pagada}` + `Equivalente: {baseTotal}`. Sin cambios de estilo.

**Fuera de alcance (consciente):** el diálogo del Panel (`receipt-dialog.tsx`) ya muestra la tasa con la dirección correcta (`1 {base} = {rate} {pagada}`), pero **no** el equivalente: es UI de mostrador, no el documento emitido. Si se quiere, se agrega con `amounts.baseTotal` en una línea.

---

## C4 — Auditoría espejo en Console 🟠 (sin migración) ✅

### Problema

`computeReceiptGaps` + `GET /api/reports/receipts` son **solo Panel**. La serie global `FS-N` (el emisor es FitStack, un único emisor legal) **no tiene auditoría de correlativo ni exportación**. El plan vende simetría entre los dos espejos; aquí no existe.

### Cambios

| Archivo | Cambio |
|---|---|
| `packages/shared/src/documents/receipt-gaps.ts` | **Algoritmo único + estrategia inyectada** (`ReceiptGapStrategy` con `format`/`parse`). Wrappers estables: `computePanelReceiptGaps({ year, slug, lastNumber, entries })` y `computeConsoleReceiptGaps({ lastNumber, entries })`. |
| `packages/database/src/repositories/platform-receipts.repository.ts` | `getPlatformReceiptSequenceState(type)` (último `next_number` + números del universo) — espejo de `payments.repository.getReceiptSequenceState`, sin año ni organización. |
| `apps/api-worker/src/repositories/platform-receipts-report.repository.ts` | (nuevo) filas paginadas + conteo por estado + filas de dinero. Scope espejo (`validated OR numbered`), rango por `receipt_issued_at` (numerados) / `payment_date` (sin numerar), todo **UTC**; `year` = año UTC de `payment_date`. |
| `apps/api-worker/src/lib/receipt-report.ts` | (nuevo) mappers puros compartidos por los DOS reportes: `asTaxDetails`, `toIsoOrNull`, `aggregateCurrencyTotals`, `classifyReceiptState`. Evita que el espejo derive. |
| `apps/api-worker/src/services/platform-receipts-report.service.ts` | (nuevo) filas + resumen (issued/pending/voided/pre_system) + totales por moneda + `gaps[]`, mismo contrato `IReceiptsReportResult` que el Panel. |
| `apps/api-worker/src/routes/platform-subscriptions.route.ts` | `GET /receipts` — filtros `from/to/status/method/year/page/limit` (máx. 1000 para CSV); cache `platform:receipts:*` (5 min) invalidada on-write en **cualquier** write de suscripciones/pagos (emisión o anulación). |
| `apps/console/app/(protected)/subscriptions/receipts/` | (nuevo) página RSC + cliente: filtros en URL, paginación 20, export CSV (hasta 1000 filas), descarga del PDF por fila y bloque de auditoría de gaps. |
| `apps/console/app/(protected)/sidebar-nav.ts` | Entrada “Comprobantes” → `/subscriptions/receipts`. |

### Nota de implementación (desvío consciente del spec)

El spec pedía `requirePlatformAuth` para el endpoint, pero ese middleware exige el permiso `organization.create`, que `support` **no** tiene (es read-only por diseño). El contrato de comprobantes ya congelado en C3 es *“support lee / no escribe”* y el criterio de esta fase exige `support → 200`, así que la **lectura** usa `requirePlatformPermission('subscription', 'list')` (idéntico a `GET /payments/:id/receipt` y a la descarga del PDF). Las escrituras siguen en 403 para `support`.

### Criterios de aceptación (verificados)

- ✅ Unit `receipt-gaps.test.ts` (**16**): la variante Console numera `FS-0000001…`, detecta hueco y anulado, y rechaza seq 0/negativo/fuera de universo/duplicado/lastNumber inválido; la de Panel conserva sus 9 casos + uno nuevo de slug normalizado.
- ✅ Integración `platform-receipts-report.test.ts` (**3**): 3 validados (1 emitido con paso 2 real, 1 anulado, 1 pendiente) + salto de secuencia forzado → `gaps[]` = 1 anulado + 5 huecos, resumen `{ issued: 1, pending: 1, voided: 1, preSystem: 0 }` y totales por moneda solo sobre emitidos no anulados.
- ✅ Integración: filtros en **UTC** (`from/to` por día UTC — no tz de organización — y `year` = año de `payment_date`), `method`, y 400 `INVALID_REPORT_FILTERS` (status/limit/año/fecha inválidos).
- ✅ Integración: `support` **lee 200** y **no escribe** 403.
- ✅ E2E `e2e/console/receipts.spec.ts`: navega al reporte por el sidebar, ve el `FS-N` sin UUID y exporta el CSV (nombre y contenido verificados).

---

## C5 — Trazabilidad de emisión 🟡 (misma migración que C1) ✅

### Problema

Se persiste `voided_by`, pero **no quién emitió**. En el fallback manual (`POST /:id/issue`) y en la validación de un pago (`PATCH /:id/status`) el actor se pierde. Es lo primero que pide una auditoría.

### Cambios

| Archivo | Cambio |
|---|---|
| `packages/database/src/schema.ts` | `payment.issuedBy` text + `platform_subscription_payment.issuedBy` text (nullable; `NULL` = emisión automática histórica o reconstruida por el barrido). |
| repos compartidos | `attach*Receipt` acepta `issuedBy`. |
| `apps/api-worker/src/services/{receipts,subscriptions,platform-receipts,platform-subscriptions}.service.ts` + rutas | Propagar `by` de sesión (`c.get('user')?.id`) hasta el paso 1; en el barrido (sin actor) queda `NULL` explícito. |
| `apps/api-worker/src/services/reports.service.ts` | Exponer `issuedBy` en la fila del reporte. |

### Criterios de aceptación

- Integración: alta con pago validado → `issued_by` = usuario de sesión; `POST /:id/issue` idem.
- Integración: fila re-encolada por el barrido → `issued_by` `NULL` (nunca un actor inventado).

---

## C6 — Robustez del barrido y contrato de anulación ✅ (sin migración)

### Problema

1. **El barrido cubría la mitad del fallo.** Solo buscaba `número sin PDF`; si el PDF ya existía y el email del paso 2 no había salido (fallo de envío con rollback de la marca, o un evento perdido), esa notificación **no la recuperaba nadie**.
2. **Un 200 mudo en la anulación.** `markReceiptVoided` lanza `RECEIPT_NOT_ISSUED` cuando el pago no tiene número (contrato interno correcto), pero el endpoint lo **tragaba** y respondía 200 sin decir nada: el operador no podía distinguir "anulé el comprobante" de "no había comprobante". `AGENTS.md` y el nombre de un test decían 409 — mintiéndose entre sí.
3. **Higiene**: `c.get('user')!.id` en la ruta de Console, y la cadencia del cron viviendo solo en una nota de PENDING.

### Cambios

| Capa | Cambio |
|---|---|
| `receipt.handler.ts` (jobs-worker) | `pendingSweepQuery(table)` con **dos predicados**: (1) numerado sin PDF (≥15 min, cubierto por el índice parcial) y (2) PDF listo sin notificar (≥30 min, para no competir con un evento que aún reintenta). Una sola definición para las dos tablas; sigue siendo query local del barrido. |
| `subscriptions.service.ts` (Panel) | `updatePaymentStatus` devuelve `{ payment, receiptVoided, receiptVoidReason? }`: el `try/catch` distingue "anulado" de `RECEIPT_NOT_ISSUED` (`not_issued`) y cualquier otro error sigue propagándose. |
| `payments.route.ts` | El body del PATCH es `{ ...payment, receiptVoided, receiptVoidReason? }`. |
| `platform-subscriptions.service.ts` + ruta | Mismo contrato (`{ receiptVoided, receiptVoidReason? }` sumado al body). El actor se resuelve con guard explícito (sin `!`). |
| Panel (`finance-service` + `payments-client`) y Console (`platform-subscriptions-service` + modal de historial) | El servicio devuelve el body y la UI muestra toast diferenciado: *"Pago anulado. No tenía comprobante emitido."* |

### Criterios de aceptación (verificados)

- ✅ Integración Panel (`T4b`): pago con PDF en R2 y `receipt_notified_at` `NULL` → el barrido lo re-encola; el evento re-encolado **no re-renderiza** (el objeto de R2 sigue ausente tras vaciar el spy), **sí** recupera el email, y un segundo pase ya no lo encola.
- ✅ Integración Console (`T4b`): mismo predicado sobre `platform_subscription_payment`, con `scope: 'platform'`.
- ✅ Integración Panel (`T8`/`T8b`): void numerado → 200 `{ receiptVoided: true }`; void sin comprobante → 200 `{ receiptVoided: false, receiptVoidReason: 'not_issued' }` (el status del pago cambia igual; `receipt_number` sigue `NULL`).
- ✅ Integración Console (`platform-receipts-void`): mismo par de asserts, con el nombre del test corregido (ya no dice 409).

### Notas de implementación

- **Índice**: el 2.º predicado no tiene índice (el parcial es `… WHERE receipt_number IS NOT NULL AND receipt_pdf_key IS NULL`). A escala *pre-venta* con `LIMIT 50` cada 10 h es irrelevante; si el barrido se vuelve lento, el índice a añadir es `(...) WHERE receipt_pdf_key IS NOT NULL AND receipt_notified_at IS NULL` (migración aparte, no incluida aquí por el criterio "C6 sin migración").
- **Límite honesto**: si el email **ya encolado** en `fit-task-events` agota reintentos y cae a su DLQ, la marca de notificado ya está puesta y el barrido no lo ve. La recuperación es manual (`POST /:id/send-email` desde el Panel, `POST /payments/:id/resend` desde Console). Ver `docs/PENDING.md` §14.


---

## C7 — Higiene, documentación y matriz de tests ✅

**Naturaleza:** deuda de higiene/docs/tests, **sin migración**. No se reimplementó nada: se verificó que la cobertura exigida ya existía (en varios casos entró con fases anteriores) y se cerraron los huecos reales.

### Matriz de tests (lo exigido vs lo que existe)

- ✅ **E2E del guardado del formulario general de sede**: ya existe en `e2e/panel/settings.spec.ts:78-98` (entró con C8) → habría detectado el 403 de D5.
- ✅ **Unit `emitterSnapshot` inmutable vs composición viva**: ya existe en `packages/shared/tests/documents/receipt-compose.test.ts:112-181` + espejo en `platform-receipt-compose.test.ts`.
- ✅ **Unit `baseTotal`**: ya existe en `receipt-compose.test.ts:83-108` + platform + `apps/jobs-worker/tests/receipt-pdf.test.ts:118`.
- ✅ **Unit del gating fiscal (`isFormalTaxpayer`)**: ya existe en `fiscal-profile.test.ts`, `tax-math.test.ts` y `document-label-gate.test.ts`.
- ✅ **`issuedBy`**: cubierto por integración (`apps/api-worker/tests/integration/receipts-snapshot.test.ts` y `platform-receipts-snapshot.test.ts`). Decisión: **no** se añade unit — es un passthrough de string sin lógica propia.

### Higiene

- ✅ `.gitignore`: regla `*.log` + **destrackeo** de los 3 logs de `spec/` (`baseline-console-build.log`, `final-build.log`, `migration-build.log`); siguen en disco como artefactos locales.
- ✅ `spec/baseline-console-bundle.md`: la referencia al build log pasa a marcarse como artefacto no versionado (el `.md` es la evidencia; el log era el insumo crudo).
- ✅ `apps/api-worker/scripts/push-test-schema.ts`: `execSync` → `spawnSync` shell-less; guardas de `TEST_DATABASE_URL` y de host≠producción intactas.
- ✅ Naming `platform_document_sequence.next_number` (se comporta como `last_number`): documentado en `packages/database/src/schema.ts` + `docs/PENDING.md` §15, **sin migración** (renombrar exigiría migración y no aporta; se agrupa si alguna vez se hace otra).

### Documentación

- `plan.md`: tabla del track con C7 ✅, cierre del track y **riesgo residual de carrera** (el perdedor con `seq` menor es irreclaimable sin renumerar; la guarda tardía reduce la ventana a ~ms; disparador de *claim-then-number* documentado).
- `AGENTS.md`: ya reflejaba el estado real (2 repos compartidos, `/receipts` en el route map, cache `platform:receipts:*`, columnas `emitter_snapshot`/`issued_by`, semántica `receiptVoided`/`not_issued`). Sin diff.
- `docs/PENDING.md`: §15 (naming) y §16 (*claim-then-number*); §9/§12/§13/§14 ya existían.
- `docs/CHECKLIST-COMPROBANTES.md`: C7 marcada y pendientes §15/§16 enlazados.

### Fuera de alcance

El fallo de `prettier --check` por CRLF es **deuda preexistente** (el repo mezcla finales de línea) y no se aborda en C7.

---

## C9 — Estados reales (anulada ≠ cancelada) y registro no eliminable 🟠 (sin migración)

### Problema

1. **Un solo nombre para dos hechos distintos.** El status derivado devolvía `cancelled` tanto al revocar el acceso a mano como cuando el cobro se anulaba o se rechazaba. Un comprobante ANULADO no es una suscripción "cancelada": el registro es **inválido**, no revocado.
2. **Una acción imposible disfrazada de disponible.** El panel ofrecía "Eliminar Registro" y el e2e la ejecutaba en su limpieza. El `DELETE /api/subscriptions/:id` siempre fallaba: la FK `payment.subscription_id` lo impide y la API lo devolvía como **500** ("Error interno del servidor: 23503" + `details.code`) — un error de integridad de negocio saliendo por la puerta del error interno, y ruido de warnings en cada corrida de E2E.
3. **Dos fallos de E2E** que había que cerrar: el storEstado de la org vacía (`empty-state.spec.ts` lo escribía en un `beforeAll`, cuando un `test.use({ storageState })` necesita el archivo **antes** de crear el contexto) y el accionable "Por validar" (la página lo cacheaba 60 s; un pago registrado por otro canal tardaba en aparecer → bug de UX además de test flaky).

### Cambios

| Capa | Cambio |
|---|---|
| `shared/constants.ts` | `SUBSCRIPTION_STATUSES.VOIDED = 'voided'` con la semántica documentada (`CANCELLED` = acceso revocado con cobro válido; `VOIDED` = registro inválido). |
| `subscriptions.repository.ts` | El status derivado pone el cobro `voided`/`invalid` **antes** de `cancelledAt` → ANULADA. `cancelledAt` sigue siendo la marca interna de "fuera de vigencia" (reportes/activos no cambian). El filtro `voided` sigue al status mostrado (`IN ARRAY [voided, invalid]`). |
| `shared/access-control.ts` | `subscriptions` pierde `delete` (ningún rol lo tiene: es un registro financiero). |
| `subscriptions.route.ts` / `.service.ts` / `.repository.ts` | Fuera `DELETE /:id` y sus métodos. Anular el cobro es la vía. |
| Panel | Badge **ANULADA** (outline) junto a **CANCELADA** (destructive); fuera la acción "Eliminar Registro", su handler y `subscriptionsService.delete`. |
| `payments/page.tsx` | La lista accionable "Por validar" se pide **sin caché** (`cache: 'no-store'`): una cola de trabajo no puede tener staleness. La tabla conserva 60 s + tag. |
| `e2e/panel-setup.ts` | Escribe **dos** storageState (suite + org vacía) antes de que el proyecto `panel` cree contextos. |
| `e2e/helpers/api-client.ts` | `DELETE_ROUTES.subscription = null`: la suscripción no se borra por API; el borrado del miembro la arrastra por FK (cascada) y el orden LIFO lo garantiza. |

### Criterios de aceptación (verificados)

- ✅ Integración: cobro `voided` → status **`voided`**; cobro `invalid` → **`voided`**; `PUT status: cancelled` → **`cancelled`**.
- ✅ Integración: filtro `status=voided` devuelve la suscripción anulada.
- ✅ Integración: `DELETE /api/subscriptions/:id` → **404** y la suscripción sigue existiendo.
- ✅ E2E panel completo: **52/52** (antes: `empty-state` 2/2 rojo y el accionable de pago pendiente rojo) y **sin** warnings `no se pudo borrar subscription`.
- ✅ Sin migración: el status sigue siendo derivado en SQL; `cancelled_at` no se toca.

---

## Decisiones congeladas (D1–D6 resueltas)

| # | Decisión | Resolución |
|---|---|---|
| **D1** | ¿`isFormalTaxpayer` gobierna el **desglose** de impuestos, no solo la etiqueta? | **Sí, y sin excepciones hacia arriba.** No formal → **sin desglose ni derivados, solo el total pagado** (afirmar un IVA que no se cobra es un hecho fiscal falso). Formal → desglose del país, ajustable a la baja. El gate de la etiqueta "Factura" sigue exigiendo las 3 condiciones. Implica cambio de comportamiento para orgs existentes sin la declaración (comunicar). |
| **D2** | IGTF (VE, condicional, `currencyPaid ≠ VES`) | **Activable, apagado por defecto, tasa manual obligatoria + checkbox de confirmación**, base correcta `gross_first` (se extrae antes del desglose de IVA). El UI advierte que cambia la base de IVA. PENDING: confirmar tasa y base con contador antes de encenderla en un gym real. |
| **D3** | Almacenamiento del snapshot del emisor | **Columna jsonb** en `payment` y `platform_subscription_payment`: el libro/export lo necesita consultable en SQL; el sidecar en R2 obligaría a leer storage en cada fila del reporte. |
| **D4** | Carrera de correlativo | **C0 pragmático ahora** (orden + guarda tardía + compensación). *Claim-then-number* queda **documentado en PENDING** con disparador explícito: "si el reporte de huecos muestra un hueco no explicado en producción". No entra en la migración de C1/C5 para mantenerla revisable. |
| **D5** | Guardado general de organización en Panel | **Se corrige** en la fase C8, en el mismo PR que C0 (ambos son bugs de producción sin migración). |
| **D6** | Validación "impuestos requieren contribuyente formal" | **Doble punto**: 400 explícito (`TAXES_REQUIRE_FORMAL_TAXPAYER`) sobre el **config fusionado** (un parcial entrante no conoce el `isFormalTaxpayer` almacenado → no basta validar el body) + normalización defensiva en `resolveFiscalProfile` para configuración ya guardada. |

---

## Orden de ejecución

```
C0 ──┐
     ├─▶ C2 ──▶ C3 ──┬──▶ C4
C8 ──┘                └──▶ C1 + C5 ──▶ C6 ──▶ C7
```

- **C0 + C8** primero, en el mismo PR: C0 corrompe datos (quema correlativos en silencio) y C8 rompe el módulo de identidad de sede en producción. Ambos sin migración.
- **C2/C3/C4** sin migración y con tests puros: paralelizables (C2 ✅ hecha).
- **C1+C5** en **una sola** migración (`0016`), con aprobación explícita. ✅
- **C9** (estados reales + registro no eliminable + los 2 fallos de E2E) es ortogonal y sin migración. ✅
- **C6** (barrido de dos predicados + contrato de anulación explícito) sin migración. ✅
- **C7** cerró la higiene, docs y matriz de tests. ✅

## Verificación por fase

```bash
pnpm typecheck                      # todas
pnpm --filter @workspace/shared test
pnpm --filter api-worker test:integration   # TEST_DATABASE_URL (rama Neon)
pnpm test:e2e:panel && pnpm test:e2e:console
```

Verificación manual obligatoria (adjuntar al PR): PDF de gym informal sin `taxId`, PDF con pago en divisa + equivalente en moneda base, PDF anulado (ANULADO visible, número conservado), reporte de comprobantes Panel y Console con un hueco y un anulado.

## Definición de "terminado"

- [x] Ninguna emisión fallida puede quemar un correlativo (test que lo prueba). — C0
- [x] `GET /:id/receipt` es reproducible: no cambia si la org edita su perfil. — C1
- [x] Ningún comprobante detalla impuestos que el emisor no declaró — fail-closed en **escritura** (400) y en **lectura** (normalización). — C2
- [x] Activar IGTF es explícito: tasa manual, confirmación y aviso de impacto en la base de IVA. — C2
- [x] La auditoría de la serie existe en los DOS espejos, con emisor congelado y actor. — C4 + C1/C5
- [x] Ningún registro de pago se elimina: se anula (`voided`, ANULADA) o se revoca (`cancelled`). — C9
- [x] Higiene, documentación y matriz de tests cerradas (sin migración). — C7

### Hallazgos de C7 (resueltos)

**El sincronizador de la rama de pruebas no corre en este entorno (RESUELTO en C7):** `pnpm --filter api-worker test:db:push` fallaba con `spawnSync cmd.exe ENOENT` (el script usaba `execSync`, que en el shell actual no encontraba `cmd.exe` aunque exista en `C:\Windows\System32`). Mientras tanto se aplicó el equivalente manual (`drizzle-kit push` con `DATABASE_URL = TEST_DATABASE_URL` y guarda previa: host de pruebas ≠ host de desarrollo). **C7** eliminó la dependencia de `execSync`/shell: `apps/api-worker/scripts/push-test-schema.ts` usa ahora `spawnSync` con `shell: false` y las guardas siguen intactas.

**E2E preexistente (RESUELTO en C9):**

`e2e/panel/subscriptions.spec.ts` → *“validar desde la lista quita el pendiente”* fallaba de forma determinista y **no** era regresión de C1/C5 (verificado en su momento: fallaba igual en el commit anterior con los cambios revertidos). Causa: `panel-setup` precalienta `/payments` (`PANEL_PREWARM_ROUTES`) y la página cacheaba su fetch con `next: { revalidate: 60 }`; el fixture del test se crea **después** del prewarm por API (sin invalidar el Data Cache de Next), así que la primera visita reutilizaba el render cacheado sin el pendiente. Se aplicó la opción (b): la lista accionable `processing` ya no se cachea. Ver C9.
- [x] El guardado de la organización en Panel funciona para owners reales (sin depender de un rol de plataforma). — C8
- [x] Las dos series (`{slug}-año-n` y `FS-n`) tienen auditoría de huecos y export. — C4
- [x] Anular sin número es explícito para el usuario, no un silencio. — C6
- [x] Un PDF listo cuya notificación se perdió vuelve a intentarse (barrido de 2 predicados). — C6
- [x] `AGENTS.md`, `plan.md` y `docs/PENDING.md` reflejan el estado real. — C7

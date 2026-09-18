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
| C1 | Snapshot del emisor (registro inmutable) | Bug fiscal | Sí | 🔴 Bloqueante | M |
| C2 | Perfil fiscal conservador (`isFormalTaxpayer`, IGTF) | Correctitud fiscal | No | 🟠 Alta | M |
| C3 | Fidelidad del PDF (placeholders, equivalente en moneda base) | Correctitud | No | 🟠 Alta | S |
| C4 | Auditoría espejo en Console (`FS-N` + export) | Hueco funcional | No | 🟠 Alta | M |
| C5 | Trazabilidad de emisión (`issued_by`) | Auditoría | Sí | 🟡 Media | S |
| C6 | Robustez de barrido y contrato de anulación | Robustez | No | 🟡 Media | S |
| C7 | Higiene, docs y matriz de tests | Deuda | No | 🟡 Media | S |

**C0 + C8 + C2 + C3 + C4 cierran el objetivo de "registro correcto + bases listas para homologar" sin tocar la DB.**
C1 y C5 comparten una única migración (se agrupan a propósito, un solo ciclo `generate → review → migrate`).

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

## C1 — Snapshot del emisor 🔴 (migración única con C5)

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

### Criterios de aceptación

- Integración: emitir → cambiar `legalName`/`taxId`/`fiscalConfig`/`countryCode` de la org → `GET /:id/receipt` devuelve **idéntico** al momento de emisión (`receipt.emitter`, `receipt.footer.disclaimer`, `receipt.document.label`).
- Integración: pago legacy (`emitterSnapshot = NULL`) sigue componiendo en vivo sin romper (contrato de 3 estados intacto).
- El flag ANULADO sigue siendo la **única** mutación posterior permitida (no forma parte de la identidad).

---

## C2 — Perfil fiscal conservador 🟠 (sin migración)

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
- Preview del panel y paso 1 dan resultados idénticos (misma función compartida; sin cambios de código en el form de pago).

---

## C3 — Fidelidad del PDF y datos del documento 🟠 (sin migración)

### Problemas (contra `docs/FACTURATION.md` §3)

1. `apps/jobs-worker/src/receipt-pdf.tsx` imprime `R.I.F.: ---` cuando falta `taxId` — §3 dice **"omitir la línea si no existe, no inventar"**. Igual para el documento del receptor.
2. Cuando `currencyPaid ≠ primaryCurrency` se muestra solo `Tasa aplicada: {rate} {currencyPaid}` — falta el **equivalente convertido en moneda base**, y el texto de la tasa es ambiguo (el rate es "pagado por unidad base").

### Cambios

| Archivo | Cambio |
|---|---|
| `apps/jobs-worker/src/receipt-pdf.tsx` | (a) Render condicional: la línea de `taxId` y la de documento del receptor solo aparecen si hay valor. (b) Bloque de conversión explícito: `1 {baseCurrency} = {rate} {currencyPaid}` + equivalente del total en moneda base. (c) Sin cambios de estilo (variance enforcement). |
| `packages/shared/src/documents/receipt-compose.ts` | Añadir `baseTotal` (equivalente convertido) a `ReceiptAmounts`, calculado con `roundCents` desde la tasa persistida — **nunca** recalculado a partir de APIs de cambio. |
| `packages/shared/src/documents/receipt-data.ts` | `checklistPrePdf`: nuevo error si un campo visible requerido quedó en placeholder (`'---'`) — el placeholder deja de ser una salida válida. |

### Criterios de aceptación

- Unit `receipt-data.test.ts`: checklist falla si un campo visible es `'---'`.
- Unit `receipt-compose.test.ts`: `baseTotal` coherente con `exchangeRateApplied`; `null` cuando monedas coinciden.
- Verificación manual: PDF de (i) gym informal sin `taxId`, (ii) pago en divisa con org de moneda base distinta. Adjuntar capturas al PR.

---

## C4 — Auditoría espejo en Console 🟠 (sin migración)

### Problema

`computeReceiptGaps` + `GET /api/reports/receipts` son **solo Panel**. La serie global `FS-N` (el emisor es FitStack, un único emisor legal) **no tiene auditoría de correlativo ni exportación**. El plan vende simetría entre los dos espejos; aquí no existe.

### Cambios

| Archivo | Cambio |
|---|---|
| `packages/shared/src/documents/receipt-gaps.ts` | Generalizar con estrategia inyectada: `computeReceiptGaps({ …, format, parseToSeq })`. Los wrappers `computePanelReceiptGaps` / `computeConsoleReceiptGaps` mantienen la API actual (tests existentes verdes, firma estable). |
| `packages/database/src/repositories/platform-receipts.repository.ts` | `getPlatformReceiptSequenceState(type)` (último `next_number` + números/pagos del universo) — espejo de `payments.repository.getReceiptSequenceState`. |
| `apps/api-worker/src/routes/platform-subscriptions.route.ts` | `GET /api/platform/subscriptions/receipts` — filas + resumen (issued/pending/voided/pre_system) + totales por moneda + `gaps[]`; filtros `from/to/status/method/year/page/limit`; `requirePlatformAuth` (support lee, **descarga permitida**, es el contrato ya congelado para comprobantes). Cache `platform:receipts:*` (5 min) invalidada on-write en validación/anulación/emisión. |
| `apps/console/app/(protected)/subscriptions/receipts/` | Página RSC + cliente (filtros en URL, `MAX_ITEMS=10`) con export CSV, espejo del reporte del Panel. |
| `apps/console/components/dashboard/...` | Entrada de navegación (respetando `filterNavItemsByFeatures` y RBAC console). |

### Criterios de aceptación

- Unit (`receipt-gaps.test.ts`): la variante Console numera `FS-0000001…`, detecta hueco y anulado, y rechaza seq 0/duplicados/fuera de universo.
- Integración: serie con 3 validados (1 anulado, 1 hueco forzado) → `gaps[]` clasifica `hueco` vs `anulado` igual que Panel.
- Integración: `support` **lee 200** y **no escribe** 403 (contrato de comprobantes ya congelado).
- E2E console: navegar al reporte, ver el `FS-N` sin UUID, exportar CSV.

---

## C5 — Trazabilidad de emisión 🟡 (misma migración que C1)

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

## C6 — Robustez del barrido y contrato de anulación 🟡 (sin migración)

| Hallazgo | Cambio |
|---|---|
| El barrido solo cubre `número sin PDF`; si el PDF existe y el email cayó a **DLQ**, la notificación se pierde para siempre (`receipt.handler.ts`, predicado `receipt_pdf_key IS NULL`). | Añadir 2.º predicado `receipt_pdf_key IS NOT NULL AND receipt_notified_at IS NULL AND receipt_issued_at < now() - interval '30 minutes'` (ambas tablas). Idempotente por el gate `markReceiptNotified`. |
| `AGENTS.md` y el test afirman "409 without number", pero el servicio **traga** `RECEIPT_NOT_ISSUED` y la respuesta es **200** (`platform-receipts.service.ts` + `platform-receipts-void.test.ts`). Un silencio es peor que un error explícito. | Devolver en el body de `PATCH /payments/:id/status` un campo explícito (`receiptVoided: boolean` + `receiptVoidReason?`), que la UI muestre en toast diferenciado ("Pago anulado. No tenía comprobante emitido."). Corregir `AGENTS.md` y el nombre/assert del test. |
| Cadencia de barrido: `0 */10 * * *` en `infrastructure/terraform/workers.tf` (pre-venta). | Convertirlo en **ítem de checklist de release** (no solo nota en PENDING): al pasar a clientes reales, `*/10 * * * *` y actualizar `plan.md`/`PENDING.md`. |
| `c.get('user')!.id` en `platform-subscriptions.route.ts` (non-null assertion). | Usar guard explícito consistente con el resto del archivo; sin `!`. |

### Criterios de aceptación

- Integración: pago con PDF y `receipt_notified_at` `NULL` → el barrido re-encola y no duplica el PDF; un segundo pase no re-envía.
- Integración: PATCH void sin número → 200 con `receiptVoided: false` y mensaje accionable en UI.

---

## C7 — Higiene, documentación y matriz de tests 🟡

| Ítem | Cambio |
|---|---|
| Artefactos de E2E | `.gitignore`: añadir `*.log` (los archivos ya se eliminaron, la regla evita la reincidencia). |
| Naming cosmético | `platform_document_sequence.nextNumber` se comporta como `lastNumber`. Renombrar es cosmético y **sí** requiere migración → se agrupa con C1/C5 **si** se aprueba; si no, queda documentado (no vale un ciclo de migración por un nombre). |
| Documentación | `plan.md` (decisiones nuevas: snapshot de emisor, gating fiscal, auditoría Console, riesgo residual de carrera), `AGENTS.md` (§1 sigue con 2 repos compartidos, route map +1 endpoint, cache key `platform:receipts:*`, columnas nuevas, semántica real de void sin número), `docs/PENDING.md` (§8 proxy de país Console sigue abierto; nuevo ítem **IGTF: base y tasa a confirmar con contador**; nuevo ítem **claim-then-number** como opción de cierre total). |
| Tests E2E | Añadir al spec de settings del panel el guardado del **formulario general** de organización (hoy solo se prueba "Guardar facturación") — habría detectado el 403 de D5. |
| Unit tests faltantes | `emitterSnapshot` (inmutable vs composición viva), `issuedBy`, gating fiscal por `isFormalTaxpayer`, `baseTotal` del PDF. |

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
C8 ──┘                └──▶ (migración aprobada) C1 + C5 ──▶ C6 ──▶ C7
```

- **C0 + C8** primero, en el mismo PR: C0 corrompe datos (quema correlativos en silencio) y C8 rompe el módulo de identidad de sede en producción. Ambos sin migración.
- **C2/C3/C4** sin migración y con tests puros: paralelizables.
- **C1+C5** en **una sola** migración, con aprobación explícita.
- **C6/C7** cierran huecos de auditoría y documentación.

## Verificación por fase

```bash
pnpm typecheck                      # todas
pnpm --filter @workspace/shared test
pnpm --filter api-worker test:integration   # TEST_DATABASE_URL (rama Neon)
pnpm test:e2e:panel && pnpm test:e2e:console
```

Verificación manual obligatoria (adjuntar al PR): PDF de gym informal sin `taxId`, PDF con pago en divisa + equivalente en moneda base, PDF anulado (ANULADO visible, número conservado), reporte de comprobantes Panel y Console con un hueco y un anulado.

## Definición de "terminado"

- [ ] Ninguna emisión fallida puede quemar un correlativo (test que lo prueba).
- [ ] `GET /:id/receipt` es reproducible: no cambia si la org edita su perfil.
- [ ] Ningún comprobante detalla impuestos que el emisor no declaró — fail-closed en **escritura** (400) y en **lectura** (normalización).
- [ ] Activar IGTF es explícito: tasa manual, confirmación y aviso de impacto en la base de IVA.
- [ ] El guardado de la organización en Panel funciona para owners reales (sin depender de un rol de plataforma).
- [ ] Las dos series (`{slug}-año-n` y `FS-n`) tienen auditoría de huecos y export.
- [ ] Anular sin número es explícito para el usuario, no un silencio.
- [ ] `AGENTS.md`, `plan.md` y `docs/PENDING.md` reflejan el estado real.

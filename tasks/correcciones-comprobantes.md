# Correcciones del track Comprobantes — plan de ejecución

> Derivado de la revisión de `plan.md`, `tasks/fase-*.md`, `docs/FACTURATION.md`, `docs/PENDING.md` y el código real (shared `documents/`, repos compartidos, paso 1, paso 2, PDF, rutas, UI, tests).
> Estado verificado al escribir este plan: `pnpm typecheck` ✅ 9/9 · `@workspace/shared` tests ✅ 244/244.
> **No se implementa nada hasta aprobación explícita** (AGENTS.md §7). Las migraciones requieren aprobación aparte.

---

## 0. Resumen ejecutivo

| # | Fase | Naturaleza | Migración | Severidad | Esfuerzo |
|---|---|---|---|---|---|
| C0 | Integridad del correlativo (orden + carrera) | Bug | No | 🔴 Bloqueante | S |
| C1 | Snapshot del emisor (registro inmutable) | Bug fiscal | Sí | 🔴 Bloqueante | M |
| C2 | Perfil fiscal conservador (`isFormalTaxpayer`, IGTF) | Correctitud fiscal | No | 🟠 Alta | S |
| C3 | Fidelidad del PDF (placeholders, equivalente en moneda base) | Correctitud | No | 🟠 Alta | S |
| C4 | Auditoría espejo en Console (`FS-N` + export) | Hueco funcional | No | 🟠 Alta | M |
| C5 | Trazabilidad de emisión (`issued_by`) | Auditoría | Sí | 🟡 Media | S |
| C6 | Robustez de barrido y contrato de anulación | Robustez | No | 🟡 Media | S |
| C7 | Higiene, docs y matriz de tests | Deuda | No | 🟡 Media | S |

**C0 + C2 + C3 + C4 cierran el objetivo de "registro correcto + bases listas para homologar" sin tocar la DB.**
C1 y C5 comparten una única migración (se agrupan a propósito, un solo ciclo `generate → review → migrate`).

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

**Alternativa completa (requiere migración, evaluar después):** *claim-then-number* — reclamar el pago con `UPDATE … WHERE receipt_number IS NULL RETURNING id` **antes** de consumir la secuencia (persistiendo ya impuestos) y asignar el número después. Elimina la carrera al 100 %; cuesta una columna nueva y una rama extra del barrido para reparar reclamaciones huérfanas.

### Criterios de aceptación

- Test de integración: org con `countryCode` inválido → la emisión falla 500 y `organization_document_sequence.last_number` **no cambia**; `gaps[]` del reporte queda **vacío**.
- Test de integración: dos `assignReceiptNumber` concurrentes sobre el mismo pago → **un** número persistido, `gaps[]` vacío.
- Tests de `receipts.repository` (unit/integración): `releaseLastNumber` no revierte si `last_number ≠ seq`.

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

### Problema

`packages/shared/src/documents/fiscal-profile.ts` nace los `countryTaxes` con `enabled: true` **ignorando `isFormalTaxpayer`**. Un gym no formal emite un comprobante que **afirma** "IVA (16 %)" en el desglose. `isFormalTaxpayer` solo gobierna la etiqueta del documento. Eso es lo contrario de "no pisar la raya fiscal".

Además, `IGTF` se modela como tasa aditiva plana y se hardcodea `3%`, cuando `docs/FACTURATION.md` §6 dice que es variable por decreto, expresada en bolívares y **a confirmar con contador**. El reparto `total/(1+Σtasas)` da una base y unos montos legalmente distintos del cálculo real (IGTF se calcula sobre el monto pagado en divisa, no sobre la base).

### Cambios

| Archivo | Cambio |
|---|---|
| `packages/shared/src/documents/fiscal-profile.ts` | (a) Default `enabled` de `countryTaxes` = `isFormalTaxpayer === true`. (b) **El override explícito de la org siempre gana** (semántica actual de matcheo por `name`). (c) Los `conditionalTaxes` nacen con `enabled: false` **y no son activables** hasta definir la base contable (regla: no inventar cálculo). |
| `apps/panel/app/(protected)/settings/organization/page.tsx` | Nota explícita en el bloque fiscal: "los impuestos se detallan solo si declaras ser contribuyente formal"; los condicionales se muestran deshabilitados con el motivo. |
| `apps/panel/components/payments/tax-block.tsx` | Ya maneja `lines.length === 0` ("Sin impuestos aplicables") ✅ — verificar copy. |
| `apps/console/.../emitter-settings.tsx` | Mismo criterio para el emisor FitStack. |

> ⚠️ **Cambio de comportamiento para orgs existentes**: un gym que hoy emite con desglose de IVA y no tiene `isFormalTaxpayer` declarado pasará a emitir sin desglose en la **siguiente** emisión (los comprobantes ya emitidos no cambian: son inmutables). Decisión D1 abajo.

### Criterios de aceptación

- Unit (`fiscal-profile.test.ts`): `isFormalTaxpayer` ausente/false → countryTaxes `enabled: false`; `true` → `enabled: true`; override explícito `{name:'IVA', enabled:true}` con `isFormalTaxpayer:false` → **gana el override**.
- Unit: `conditionalTaxes` (IGTF) nunca aplican por default; `isTaxApplicable` sigue fail-closed.
- Integración: emisión de gym no formal → `taxDetails` vacío, `subtotal === total`, label `"Comprobante de pago"`.
- El preview del panel y el paso 1 siguen dando resultados idénticos (misma función compartida) — sin cambios de código en el form.

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

## Decisiones abiertas (requieren tu confirmación)

| # | Decisión | Recomendación |
|---|---|---|
| **D1** | ¿`isFormalTaxpayer` gobierna el **desglose** de impuestos (no solo la etiqueta)? Implica cambio de comportamiento para orgs existentes sin la declaración. | **Sí** — es el único gate honesto; el flag se declara con fricción justamente para eso. |
| **D2** | IGTF: ¿lo dejamos **no activable** hasta confirmar base/tasa con contador, o implementamos el modelo de dos bases (`base` vs `monto pagado en divisa`)? | **No activable** + documentado. No implementar matemática que aún no está validada (AGENTS.md §10: nada inventado en silencio). |
| **D3** | Snapshot del emisor: ¿columna jsonb o *sidecar* JSON en R2 junto al PDF (cero migración)? | **Columna**: el libro/export lo necesita consultable en SQL; el sidecar obligaría a ir a R2 en cada lectura del reporte. |
| **D4** | Carrera de correlativo: ¿C0 pragmático (sin migración) o *claim-then-number* completo? | **C0 ahora**, reevaluar *claim-then-number* cuando C1/C5 ya abran migración. |
| **D5** | Endpoint del formulario general de organización en el Panel (`/platform/organizations` con `requirePlatformAuth` → 403 a owners reales, invisible en dev porque la cuenta del dev tiene rol de plataforma). | **Corregir**: mover el guardado a `PATCH /api/organizations/profile` (org-scoped) o `authClient.organization.update()` (AGENTS.md §5). Fuera del scope fiscal, pero vive en la misma página/fila que el bloque fiscal. |

---

## Orden de ejecución

```
C0 ──▶ C2 ──▶ C3 ──┬──▶ C4
                    └──▶ (migración aprobada) C1 + C5 + [renombre C7] ──▶ C6 ──▶ C7
```

- **C0** primero: es el único que corrompe datos en producción (quema números).
- **C2/C3/C4** sin migración y con tests puros: se pueden paralelizar.
- **C1+C5** en **una sola** migración, con aprobación explícita.
- **C6/C7** cierran: sin ellos quedan huecos de auditoría y documentación desactualizada.

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
- [ ] Ningún comprobante detalla impuestos que el emisor no declaró.
- [ ] Las dos series (`{slug}-año-n` y `FS-n`) tienen auditoría de huecos y export.
- [ ] Anular sin número es explícito para el usuario, no un silencio.
- [ ] `AGENTS.md`, `plan.md` y `docs/PENDING.md` reflejan el estado real.

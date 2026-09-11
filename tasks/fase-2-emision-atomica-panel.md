# Fase 2 — Emisión atómica Panel (número + PDF indivisibles)

> Depende de: Fase 0 (gate, tax-math, formatos, `ReceiptData`, checklist) y Fase 1 (secuencia + columnas). Aquí nace el comprobante real.

## Objetivo

`issueReceipt()`: asignar número + renderizar PDF + persistir en R2 + actualizar `payment` como **una transacción lógica atómica** (si falla R2 → rollback, nunca número sin documento). Emisión **automática** al pasar el pago a `validated` (decisión 3). Reimprimir/reenviar = READ. Emitir no exige email (decisión 8, mostrador).

## Contexto verificado

- `apps/api-worker/src/services/subscriptions.service.ts` — `create()` (línea ~80-158): valida member/plan, bloquea duplicado si hay `processing` previo, crea `subscription` + `payment` en **dos inserts secuenciales sin transacción explícita**, encola `email.payment_receipt` **solo si `status === 'validated'`** (línea ~149). `updatePaymentStatus()` (línea ~160-187): `voided/invalid` → cancela subscription; transición a `validated` → encola recibo. `sendReceiptEmail()` (línea ~206) encola sin validar estado ni email.
- `apps/api-worker/src/routes/payments.route.ts` — `PATCH /:id/status` (permiso `SUBSCRIPTIONS.UPDATE`, invalida caches `subscriptions*`, `payments:analytics`, `members:stats`, `dashboard:*`, `reports:revenue*`); `POST /:id/send-email` (permiso `SUBSCRIPTIONS.READ`, sin validaciones). No existe `GET /:id/receipt` ni `POST /:id/issue` ni `GET /:id/pdf`.
- `apps/api-worker/src/routes/subscriptions.route.ts` — `POST /` (`SUBSCRIPTIONS.CREATE` + `requireOrgTimezone()` + `createSubSchema`), helper `invalidateSubscriptionDependentCaches` ya invalida todo lo dependiente.
- `apps/api-worker/src/lib/r2.ts` — `createR2Service` solo tiene `getUploadUrl/listFiles/deleteFile`. **No tiene `put`/`get`**: hay que agregar `putFile(key, bytes, contentType)` + `getFile(key)` usando el binding `FILES_BUCKET` (ya existe en `Env`, `lib/env.ts`).
- `apps/api-worker/src/lib/storage-keys.ts` — `constructStorageKey` mete sufijo aleatorio → **no sirve** para PDFs deterministas. Hace falta builder nuevo (no modificar el existente, que usan las capturas).
- `apps/api-worker/src/lib/route-handler.ts` — middlewares `requireOrgPermission`, `requireOrgTimezone` (año y fechas en tz del gym, nunca UTC del servidor).
- Motor PDF: `@react-pdf/renderer` **sí está** en `apps/jobs-worker/package.json` (^4.2.1) y en legacy `apps/api` (`services/pdf/receipt-pdf.tsx` como base visual, con `@react-pdf/renderer` ^4.5.1). **No está** en `apps/api-worker` → agregarlo como dependencia si el PDF se renderiza en `issueReceipt()` (decisión: sí, atomicidad número+PDF).
- `apps/api-worker/src/index.ts` — ver mounts actuales para registrar la nueva ruta (o extender `payments.route.ts`).

## Crear

| Archivo | Contenido |
|---|---|
| `apps/api-worker/src/repositories/receipts.repository.ts` | Si no se creó en Fase 1, crearlo aquí (ver task Fase 1). |
| `apps/api-worker/src/services/receipts.service.ts` (factory `createReceiptsService(db, r2, queue?, env)`) | `composeReceiptData(orgId, paymentId)` — carga org (con `fiscalConfig`) + member + subscription + payment; resuelve perfil fiscal (Fase 0); calcula impuestos (auto u override con reason obligatorio); resuelve etiqueta por gate (hoy siempre "Comprobante"); enmascara `paymentMethodDetails` (`maskPaymentDetails` de shared; `file` = links, no texto); congela emisor en snapshots del comprobante; devuelve `ReceiptData`. `issueReceipt({ orgId, paymentId, actor?, timezone, slug })` — contrato: 1) valida `status === 'validated'` (409 si no); 2) idempotencia: si ya tiene `receipt_number`, devuelve el existente; 3) `nextDocumentNumber` (año en tz del gym); 4) compone `ReceiptData` → `checklistPrePdf`; 5) render PDF bytes; 6) `PUT` R2 en key determinista; 7) `UPDATE payment SET receipt_number, receipt_issued_at, receipt_pdf_key, subtotal, tax_total, tax_details…`. Si **cualquier** paso falla → rollback, reintento seguro. |
| `apps/api-worker/src/services/receipt-pdf.ts` (o `lib/receipt-pdf.ts`) | Render PDF consumiendo `ReceiptData` de Fase 0 con `@react-pdf/renderer`. Base visual: legacy `apps/api/services/pdf/receipt-pdf.tsx` (adaptar: número correlativo en vez de `paymentId.padStart(6)`, disclaimer por país, montos `numeric` del gym —no centavos—, tasa visible, referencia enmascarada, UUID ausente). Un solo renderizador (decisión 1): este mismo output es el adjunto del email (Fase 3) y la descarga del panel. |
| `apps/api-worker/src/lib/receipt-storage-keys.ts` | `panelReceiptKey(orgId, year, receiptNumber)` → `cms/<orgId>/receipt-documents/<year>/<numero>.pdf` (determinista, sin sufijo aleatorio, sin colisión con `receipts/` de capturas). |
| `apps/api-worker/src/routes/receipts.route.ts` (o extender `payments.route.ts` — decidir en implementación; preferencia: extender `payments.route.ts` para no tocar `index.ts`) | `GET /api/payments/:id/receipt` (permiso `SUBSCRIPTIONS.READ` — cashier incluido: reimprimir/descargar) → descarga o redirect firmado a R2; histórico `NULL` → 409/404 `"anterior al sistema correlativo"`. `POST /api/payments/:id/issue` (fallback manual, permiso `SUBSCRIPTIONS.UPDATE` — owner/manager únicamente). |

## Modificar

| Archivo | Cambio |
|---|---|
| `apps/api-worker/src/lib/r2.ts` | Agregar `putFile(key, body, contentType)` + `getFile(key)` con `FILES_BUCKET`. |
| `apps/api-worker/src/services/subscriptions.service.ts` | `create()` con `validated` y `updatePaymentStatus()` → `validated`: sustituir `taskQueue.send(email.payment_receipt)` directo por `issueReceipt()` y **después** encolar notificación con `{ paymentId, organizationId, receiptNumber }`. `updatePaymentStatus()` → `voided`: si el pago ya tenía número → `markVoided` (conserva número + PDF, setea `receipt_voided`, `voided_by/at/reason`), además del `cancel()` de subscription que ya hace. Extender firma del servicio para recibir `r2` + `orgSlug/timezone` donde haga falta. |
| `apps/api-worker/src/routes/payments.route.ts` | `PATCH /:id/status` y `POST /:id/send-email`: `send-email` valida email del miembro (422 `"sin email registrado: imprima en mostrador"` si falta) y caso histórico sin PDF (reenvía notificación sin adjunto, ver Fase 3). Nuevos endpoints de arriba. Misma invalidación de caches existente + `org:{id}:receipts*` si se cachea lectura. |
| `apps/api-worker/package.json` (+ lock) | Agregar `@react-pdf/renderer` (alinear versión con jobs-worker ^4.2.1 o legacy ^4.5.1 — verificar compat con Workers antes; riesgo de bundle, mitigar con import dinámico/lazy si hace falta). |

## No tocar

jobs-worker (Fase 3), panel (Fase 3-4), `platform_subscription_payment` (C2), `constructStorageKey` existente.

## Criterios de aceptación

- Test integración (rama Neon): crear sub con pago `validated` → genera `receipt_number` con formato + PDF en R2 (spy de R2/Queue); fallo simulado de R2 → sin número huérfano, reintento no duplica (idempotencia por `WHERE receipt_number IS NULL`).
- Pago `processing` → `issue` responde 409; `voided` con número → conserva número y marca ANULADO + cancela subscription (comportamiento existente preservado).
- `GET /:id/receipt` funciona sin email en el miembro; histórico `NULL` → mensaje "anterior al sistema".
- `pnpm typecheck`, `lint`, `test:integration` verdes.

## Verificación

```bash
pnpm --filter api-worker test:integration
pnpm typecheck
pnpm lint
```

## Riesgos

- Peso de `@react-pdf/renderer` en el bundle del Worker: medir; si es problema, plan B = render en jobs-worker rompe atomicidad → no aceptable; alternativa real = adelgazar imports o generar PDF minimalista propio.
- Transacciones Drizzle en Neon serverless: verificar `db.transaction` + `FOR UPDATE`; fallback `UPDATE … RETURNING` (ver Fase 1).

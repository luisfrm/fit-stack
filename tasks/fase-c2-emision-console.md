# Track Console C2 — Emisión automática del comprobante SaaS

> Depende de: C1 (secuencia global + columnas) y Fase 2 (patrón en dos pasos). Espejo de Fase 2 para el emisor FitStack.

## Objetivo

Al validarse un pago SaaS, emitir `FS-N` + PDF inmutable en R2 y notificar con adjunto. Campos obligatorios del documento + reglas diferenciales vs Panel.

## Contexto verificado

- `apps/api-worker/src/services/platform-subscriptions.service.ts` — puntos de enganche: `createSubscriptionWithPayment` (trial/free fuerzan `validated`), `renewSubscription` (solo extiende periodo si `VALIDATED`), `registerPayment` (idem), `updatePaymentStatus` (→`VALIDATED` extiende periodo con lógica acumulativa `currentPeriodEnd > now ? currentPeriodEnd : now`). La emisión se engancha **donde el pago queda validado**, después de extender el periodo.
- `apps/jobs-worker/src/handlers/pdf.handler.ts` — `handleOrgPaymentReceived`: lee `platform_subscription_payment` + org, owners (`authMember role=owner → user.email`), dedupe payer+owners, `pendingReview` si `processing`, template `org-payment-received.ts`. Hoy solo HTML. Reutilizar para adjunto (C3).
- Tablas fuente: `platformSubscriptionPayment` (snapshots `planSnapshotName/Price/Currency/DurationValue/Unit`, `amountPaid` **centavos**, `currencyPaid`, `exchangeRateApplied`, `baseAmount`, método) + `platformSubscription` (`startDate`, duración snapshot → periodo cubierto) + `organization` (receptor: `legalName/name`, `taxId`).
- Diferencias vs Panel (documento fuente, obligatorias): emisor = FitStack (keys C1); receptor = la org; pie = disclaimer del país del **org receptor como proxy** (TODO explícito + **ítem en `PENDING.md`**: cambiar al país FitStack cuando exista `fitstack_country_code` configurado) + "Emitido por FitStack"; `featuresSnapshot` **no** se imprime en el PDF pero **sí queda disponible para exportación** si el Org lo pide como respaldo; impuestos los define FitStack uniforme por país (la org no decide su IVA); hoy nunca `invoice`.

## Crear / modificar

| Archivo | Cambio |
|---|---|
| `apps/api-worker/src/services/platform-receipts.service.ts` (nuevo, factory) | Mismo patrón en dos pasos de Fase 2, sobre la **misma cola `fit-receipt-events`** (nuevo evento `platform-receipt.render` o discriminador `scope: 'platform'`, mismo consumer en api-worker): **paso 1 síncrono** donde el pago queda validado (número global `FS-N` + impuestos + `UPDATE … WHERE receipt_number IS NULL`, responde `{ receiptNumber, pdfStatus: "pending" }`, encola render) + **paso 2 en el consumer** (compone datos: receptor org, detalle snapshots, periodo `startDate+duración`, montos incl. `baseAmount`, método enmascarado, `paymentDate` vs emisión, pie proxy → `checklistPrePdf` → render → PUT R2 `platform/receipts/<año>/FS-<n>.pdf` → `UPDATE … WHERE receipt_pdf_key IS NULL RETURNING`; **solo si `rowCount === 1`** encola `email.org_payment_received`). Sin rollback de números: `receipt_pdf_key IS NULL` = pendiente reintentable. |
| `apps/jobs-worker/src/index.ts` (`scheduled()`) | **Extender el barrido de Fase 2** para cubrir también `platform_subscription_payment` (misma query/lote/umbral, re-encola `platform-receipt.render`). Un solo cron cubre ambos emisores. |
| `apps/api-worker/src/services/platform-subscriptions.service.ts` | Enganchar el **paso 1** tras cada transición a validado (create trial/free, renew, register, `updatePaymentStatus`). La notificación de `processing` ("bajo revisión", sin adjunto) sigue saliendo al registrar la renovación como hoy; **el email con comprobante numerado + adjunto lo encola el paso 2** al completar el PDF (nunca el paso 1). |
| `apps/api-worker/src/lib/receipt-storage-keys.ts` (Fase 2) | Agregar `platformReceiptKey(year, receiptNumber)`. |
| `apps/jobs-worker/src/index.ts` (`FitTaskEvent`) | `email.org_payment_received` += `receiptNumber?` (compat). |

## Criterios de aceptación

- Integración: aprobar pago SaaS pendiente (soporte) → paso 1 genera `FS-N` de inmediato (`pdfStatus:'pending'`), el consumer completa el PDF inmutable y **solo entonces** encola el email; **entrega duplicada del mensaje no genera segundo PDF ni segundo email**; el barrido cubre también esta tabla; histórico `NULL` → "anterior al sistema"; periodo extendido (lógica acumulativa existente) intacto.
- `pnpm --filter api-worker test:integration`, `typecheck`, `lint` verdes.

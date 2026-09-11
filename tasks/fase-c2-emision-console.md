# Track Console C2 — Emisión automática del comprobante SaaS

> Depende de: C1 (secuencia global + columnas) y Fase 2 (patrón `issueReceipt` atómico). Espejo de Fase 2 para el emisor FitStack.

## Objetivo

Al validarse un pago SaaS, emitir `FS-N` + PDF inmutable en R2 y notificar con adjunto. Campos obligatorios del documento + reglas diferenciales vs Panel.

## Contexto verificado

- `apps/api-worker/src/services/platform-subscriptions.service.ts` — puntos de enganche: `createSubscriptionWithPayment` (trial/free fuerzan `validated`), `renewSubscription` (solo extiende periodo si `VALIDATED`), `registerPayment` (idem), `updatePaymentStatus` (→`VALIDATED` extiende periodo con lógica acumulativa `currentPeriodEnd > now ? currentPeriodEnd : now`). La emisión se engancha **donde el pago queda validado**, después de extender el periodo.
- `apps/jobs-worker/src/handlers/pdf.handler.ts` — `handleOrgPaymentReceived`: lee `platform_subscription_payment` + org, owners (`authMember role=owner → user.email`), dedupe payer+owners, `pendingReview` si `processing`, template `org-payment-received.ts`. Hoy solo HTML. Reutilizar para adjunto (C3).
- Tablas fuente: `platformSubscriptionPayment` (snapshots `planSnapshotName/Price/Currency/DurationValue/Unit`, `amountPaid` **centavos**, `currencyPaid`, `exchangeRateApplied`, `baseAmount`, método) + `platformSubscription` (`startDate`, duración snapshot → periodo cubierto) + `organization` (receptor: `legalName/name`, `taxId`).
- Diferencias vs Panel (documento fuente, obligatorias): emisor = FitStack (keys C1); receptor = la org; pie = disclaimer del país del **org receptor como proxy** (TODO explícito: cambiar al país FitStack cuando exista `fitstack_country_code` configurado) + "Emitido por FitStack"; `featuresSnapshot` **no** se imprime salvo pedido explícito; impuestos los define FitStack uniforme por país (la org no decide su IVA); hoy nunca `invoice`.

## Crear / modificar

| Archivo | Cambio |
|---|---|
| `apps/api-worker/src/services/platform-receipts.service.ts` (nuevo, factory) | `issuePlatformReceipt({ paymentId, actor })` — mismo contrato atómico Fase 2: valida pago validado → idempotencia (`receipt_number` existente) → `nextPlatformDocumentNumber` → compone datos (receptor org, detalle snapshots, periodo `startDate+duración`, montos incl. `baseAmount`, método enmascarado, `paymentDate` vs emisión, pie proxy) → `checklistPrePdf` → render PDF → PUT R2 `platform/receipts/<año>/FS-<n>.pdf` → UPDATE. Fallo R2 → rollback. |
| `apps/api-worker/src/services/platform-subscriptions.service.ts` | Enganchar `issuePlatformReceipt` tras cada transición a validado (create trial/free, renew, register, `updatePaymentStatus`), y **después** encolar `email.org_payment_received` con `{ paymentId, organizationId, payerEmail, payerName, receiptNumber }`. |
| `apps/api-worker/src/lib/receipt-storage-keys.ts` (Fase 2) | Agregar `platformReceiptKey(year, receiptNumber)`. |
| `apps/jobs-worker/src/index.ts` (`FitTaskEvent`) | `email.org_payment_received` += `receiptNumber?` (compat). |

## Criterios de aceptación

- Integración: aprobar pago SaaS pendiente (soporte) → genera `FS-N` + PDF inmutable; idempotente; histórico `NULL` → "anterior al sistema"; periodo extendido (lógica acumulativa existente) intacto.
- `pnpm --filter api-worker test:integration`, `typecheck`, `lint` verdes.

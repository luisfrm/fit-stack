Plan final — Comprobantes Panel + Console
Modo Plan: no edito archivos, solo presento el plan para tu aprobación.
Decisiones incorporadas
 1. PDF = fuente de verdad, email solo notificación corta, un solo composeReceiptData.
 2. PDFs persistidos en R2, una sola vez, inmutables.
 3. Emisión automática al pasar a validated; reimprimir/reenviar = READ (cashier sí). Manual fallback = solo owner/manager.
 4. Híbrido impuestos: auto por defecto + override solo con taxOverrideReason.
 5. Numeración reinicia por año.
 6. Voided = ANULADO, nunca reusar. gaps[] distingue hueco vs anulado.
 7. Sin backfill, históricos NULL.
 8. Emitir ≠ enviar: emitir sin email funciona (mostrador).
 9. Correcciones: upsert antes de FOR UPDATE (carrera año nuevo), número+PDF atómicos en issueReceipt(), isFormalTaxpayer con checkbox de declaración explícita.
10. UUID se conserva como PK técnica; receiptNumber es campo humano aparte. Dos secuencias porque hay dos emisores legales.
Verificación previa (read-only)
- platformSubscriptionPayment y payment no tienen receipt_number; no existe tabla de secuencias.
- Emisor FitStack no existe: hay que crear keys en platform_setting (fitstack_legal_name, tax_id, address, country_code). Vacías = gate invoice bloqueado.
- email.org_payment_received y templates ya existen, pero no generan ni adjuntan PDF — se reutilizan.
- R2: carpeta receipts ya usada para capturas. Propuesta sin colisión: Panel cms/<org>/receipt-documents/<año>/<numero>.pdf, Console platform/receipts/<año>/FS-N.pdf. constructStorageKey actual mete sufijo aleatorio → hace falta builder determinista nuevo.
Principios transversales
UUID nunca visible, todo desde snapshots (y congelar emisor al emitir), moneda+tasa juntas, disclaimer desde COUNTRIES, etiqueta por gate de 3 condiciones. En Console se usa país del org receptor como proxy hasta que FitStack tenga país propio.
Fase 0 — Lógica pura en shared/documents/
Crear document-label-gate.ts (resolveDocumentLabel, fuerza Comprobante si falta 1/3), fiscal-profile.ts, tax-math.ts (auto + applyTaxOverride que exige reason), receipt-number.ts ({slug}-2026-000045 y FS-0000001), receipt-data.ts (contrato ReceiptData + checklistPrePdf). Aceptación: unit tests gate, override sin reason lanza, checklist detecta UUID/tasa faltante.
Fase 1 — DB Panel
Una tabla unificada (concilia doc B con reinicio anual):
- organization_document_sequence(organization_id, document_type, year, last_number), PK triple.
- payment: receipt_number, document_type default 'receipt', receipt_issued_at, receipt_pdf_key, tax_override_reason, receipt_voided default false. Unique (organization_id, receipt_number) where not null.
nextDocumentNumber: INSERT ... ON CONFLICT DO NOTHING → SELECT FOR UPDATE → UPDATE+1, en transacción. Año en tz del gym. Flujo generate→review→migrate, prohibido push. Aceptación: test de carrera sin duplicados.
Fase 2 — Emisión atómica Panel
Nuevos features/receipts/: repository, service issueReceipt(), receipt-pdf.ts, receipt-storage-keys.ts. Contrato: carga snapshots → impuestos → gate etiqueta → nextDocumentNumber (año tz gym) → render PDF → PUT R2 → UPDATE payment. Si falla R2, rollback: nunca número sin documento. Idempotente (si ya tiene número, devuelve el existente). Hook en subscriptions.service (create validado + updatePaymentStatus→validated) sustituye el taskQueue.send directo. PATCH :id/status→voided conserva número y marca ANULADO. GET :id/receipt (READ) descarga; POST :id/issue manual solo owner/manager. Emitir no exige email. Aceptación: emisión auto, fallo R2 sin huérfanos, voided conserva, histórico NULL → "anterior al sistema".
Fase 3 — Email-notificación + adjunto
email.handler con attachments en Resend+SMTP. handlePaymentReceipt lee PDF de R2 por key (no regenera), HTML corto sin Operación #id. Evento lleva receiptNumber. Sin email → emisión OK, send-email 422 "imprima en mostrador". Histórico → email sin adjunto. Aceptación: adjunto idéntico al descargado en panel.
Fase 4 — Config fiscal Panel
Sección settings Facturación: legalName, taxId (label taxLabel), address, taxes[] toggle, isFormalTaxpayer con checkbox de declaración + doble confirmación. Backend exige confirmed:true o 400. Form de pago muestra impuestos auto + taxOverrideReason obligatorio para override. Gate backend fuerza 'receipt' mientras hasFiscalHomologation=false. Aceptación: 400 sin confirmación/reason, PE muestra IGV, US sin impuestos.
Fase 5 — Gaps y auditoría
GET /api/receipts/gaps?year= (READ + requireOrgTimezone): emitido | anulado | hueco. Añadir voided_by/at/reason (en migración Fase 1 si da tiempo, si no propia). UI con badges + listado de overrides. Aceptación: clasifica 1 anulado + 1 hueco correctamente.
Fase 6 — Cierre Panel
Vitest + integración, E2E validar→descargable, actualizar AGENTS.md y PENDING.md, typecheck/lint/test.
Track Console C1-C3 (tras Panel)
- C1: platform_document_sequence(document_type, next_number) global (FS-0000001), columnas en platform_subscription_payment, 4 keys emisor FitStack en console settings.
- C2: issuePlatformReceipt() al validar pago SaaS → evento org_payment_received con receiptNumber. Receptor org, periodo desde startDate+duración snapshot, pie "Emitido por FitStack". featuresSnapshot no se imprime.
- C3: descarga + reenvío en console (platform auth), invalida platform:subscriptions*.
Orden
0 → 1 → 2 → 3 (+ 4 en paralelo con 3) → 5 → 6 → C1-C3. Solo C1-config paralelizable antes.
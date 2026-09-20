# Modelo de emisión de comprobantes por la organización

> Documento interno de referencia. Estado del producto: **sin homologación fiscal conectada**.
> Alcance: **Panel**, relación **organización/gym → miembro**.
> Documentos relacionados: `docs/FACTURATION.md` y `docs/RESPONSABILITIES.md`.

## 1. Qué significa “facturar” en FitStack

En el producto, cuando una organización “factura” no está emitiendo una factura fiscal ante una autoridad tributaria. Está haciendo esto:

1. Registrar un pago.
2. Validarlo.
3. Emitir un **comprobante de pago interno**, numerado y con PDF inmutable.
4. Poner ese comprobante a disposición del miembro por descarga y/o correo.

FitStack **no presenta, declara, retiene ni paga impuestos por la organización**, y **no transmite documentos a SENIAT, DIAN, SAT, AFIP, SII, SUNAT ni otra autoridad**.

## 2. Quién es quién

- **Vendedor legal:** la organización/gym.
- **Comprador:** el miembro.
- **FitStack:** proveedor de registro, cálculo interno, documento y distribución.
- **Responsable fiscal de la venta:** exclusivamente la organización.

La declaración `isFormalTaxpayer` es una afirmación de la propia organización. FitStack no la verifica.

## 3. Flujo real cuando un pago queda validado

### 3.1 Entrada

La emisión ocurre cuando un pago queda en estado `validated`:

- Alta directa con pago validado.
- Cambio posterior de `processing` a `validated`.
- Emisión manual mediante `POST /api/payments/:id/issue`.
- Si el pago se anula después, el comprobante ya emitido se conserva (write-once) y se marca **ANULADO**: se genera un PDF **nuevo** con el sello y el de emisión deja de entregarse hasta que ese artefacto exista (fail-closed). El número nunca se libera ni se reutiliza.

Código: `apps/api-worker/src/services/subscriptions.service.ts:190`, `apps/api-worker/src/services/subscriptions.service.ts:256`, `packages/database/src/repositories/receipts.repository.ts:170`.

### 3.2 Paso 1: numeración e impuestos persistidos

`assignReceiptNumber` hace lo siguiente:

1. Exige pago `validated`; en otro caso responde `409 NOT_VALIDATED`.
2. Reutiliza el número si el pago ya estaba numerado.
3. Calcula el año en la zona horaria de la organización.
4. Reserva el siguiente número en la secuencia anual por organización.
5. Calcula el desglose en centavos enteros:
   - Automático: descomposición tax-inclusive con `computeInclusiveTaxes`.
   - Manual: override auditado con `taxOverrideReason` obligatorio.
6. Persiste número, fecha de emisión, impuestos y motivo de override.
7. Encola `receipt.render`.
8. No envía correo en este paso.

Código: `apps/api-worker/src/services/receipts.service.ts:81`, `apps/api-worker/src/services/receipts.service.ts:149`, `apps/api-worker/src/services/receipts.service.ts:175`, `packages/shared/src/documents/tax-math.ts:95`.

### 3.3 Paso 2: PDF inmutable y notificación

El consumer `handleReceiptRender` hace lo siguiente:

1. Lee pago, organización, miembro y suscripción con aislamiento por organización.
2. Construye `ReceiptData` con el mismo builder usado por la API.
3. Ejecuta el checklist previo al PDF.
4. Renderiza el PDF.
5. Lo guarda en R2 en una key determinista.
6. Marca `receipt_pdf_key` con una actualización condicional como gate.
7. Marca la notificación con `receipt_notified_at`.
8. Encola `email.payment_receipt`.

Si el envío falla, limpia la marca para que la cola pueda reintentarlo. No genera un segundo PDF ni un segundo correo por entregas duplicadas.

Código: `apps/jobs-worker/src/handlers/receipt.handler.ts:87`, `apps/jobs-worker/src/handlers/receipt.handler.ts:129`, `apps/jobs-worker/src/handlers/receipt.handler.ts:133`, `packages/database/src/repositories/receipts.repository.ts:268`, `packages/database/src/repositories/receipts.repository.ts:296`.

### 3.4 Qué recibe el miembro

El correo es una notificación corta. El PDF adjunto es la fuente de verdad:

- Se lee desde R2.
- No se regenera para el correo.
- Es byte a byte el mismo documento disponible en el Panel.
- El asunto y cuerpo usan el número correlativo humano, nunca el ID técnico del pago.
- Los pagos anteriores al sistema correlativo pueden enviarse sin adjunto como caso histórico terminal.

Código: `apps/jobs-worker/src/handlers/pdf.handler.ts:30`, `apps/jobs-worker/src/handlers/pdf.handler.ts:114`, `apps/jobs-worker/src/templates/payment-receipt-short.ts:23`.

El Panel expone tres estados:

- `ready`: comprobante disponible y descargable.
- `pending`: numerado, PDF en preparación.
- `pre_system`: pago anterior al sistema correlativo.

Código: `apps/api-worker/src/routes/payments.route.ts:83`, `apps/api-worker/src/routes/payments.route.ts:110`, `apps/api-worker/src/services/receipts.service.ts:215`.

## 4. Qué emitimos como “recibo de pago”

Cada comprobante contiene:

- Identidad emisora congelada: nombre, razón social si existe, identificación fiscal si existe, dirección y país.
- Etiqueta aplicada por el gate.
- Número correlativo humano por organización y año.
- Receptor: nombre del miembro y documento si existe.
- Venta: nombre del plan desde snapshot, periodo y fecha del pago frente a fecha de emisión.
- Montos en centavos enteros: subtotal, líneas de impuesto, total, moneda pagada, tasa aplicada cuando corresponde.
- Método de pago con detalles enmascarados.
- Disclaimer del país o override configurado por la organización.
- Marca `ANULADO` cuando aplica: el sello vive en los bytes del PDF (`receipt_voided_pdf_key`), no solo en la UI.
- `internalPaymentId` solo para trazabilidad interna, nunca visible.

Código: `packages/shared/src/documents/receipt-compose.ts:115`, `packages/shared/src/documents/receipt-compose.ts:127`, `packages/shared/src/documents/receipt-compose.ts:152`, `packages/shared/src/documents/receipt-compose.ts:192`.

## 5. De qué nos encargamos

FitStack se encarga de:

- Registrar monto, moneda, tasa aplicada, método, fechas y estado del pago.
- Calcular el desglose interno en centavos sin inventar valores.
- Numerar correlativamente por organización y año.
- Congelar snapshots del plan y de la identidad emisora.
- Generar un PDF determinista e inmutable.
- Guardarlo en R2 bajo una key determinista.
- Enmascarar referencias sensibles.
- Mostrar la etiqueta honesta del documento.
- Ofrecer descarga, reenvío y estados.
- Mantener aislamiento estricto por organización.
- Rechazar configuraciones inválidas de forma visible.
- No asumir país, moneda, zona horaria ni condición fiscal.

## 6. De qué NO nos encargamos

FitStack no se encarga de:

- Determinar si una organización es contribuyente formal.
- Verificar un RIF, NIT, RUC, CUIT u otra identificación fiscal.
- Declarar, retener, pagar o compensar impuestos.
- Enviar comprobantes a una autoridad tributaria.
- Generar numeración fiscal oficial.
- Convertir un comprobante interno en factura electrónica.
- Usar la palabra “Factura” sin homologación real.
- Sustituir al contador ni al sistema contable/fiscal externo de la organización.

## 7. Responsabilidad de la organización

La organización debe:

- Registrar su identidad legal verdadera: razón social, identificación fiscal y dirección.
- Declarar `isFormalTaxpayer` solamente si corresponde a su situación real.
- Mantener actualizados impuestos, disclaimer y datos emisores.
- Decidir si una venta requiere factura fiscal.
- Usar un proveedor homologado, imprenta autorizada o contador cuando la ley lo exija.
- Cumplir IVA/IGV, IGTF u otras obligaciones aplicables.
- Conservar y presentar su propia documentación fiscal fuera de FitStack cuando corresponda.

Activar `isFormalTaxpayer` no transfiere responsabilidad a FitStack.

## 8. Cómo se configura la identidad fiscal hoy

La organización edita su perfil emisor mediante `PATCH /api/organizations/profile`.

Campos relevantes:

- `legalName`
- `taxId`
- `address`
- `fiscalConfig`
- `confirmed`, solo como fricción para declarar contribuyente formal.

Reglas actuales:

- Ruta org-scoped con permiso `ORGANIZATION.UPDATE`.
- `countryCode` y `primaryCurrency` son inmutables después de la creación.
- `fiscalConfig` se fusiona, no se reemplaza a ciegas.
- `fiscalConfig: null` restablece los defaults del país.
- `isFormalTaxpayer: true` exige `confirmed: true` solamente en la transición desde no formal.
- Se invalida el perfil cacheado de la sesión.

Código: `apps/api-worker/src/routes/organizations.route.ts:227`, `apps/api-worker/src/services/organizations.service.ts:38`, `apps/api-worker/src/services/organizations.service.ts:130`.

`fiscalConfig` admite:

- `documentLabel`: etiqueta solicitada, actualmente solo lectura en producto.
- `isFormalTaxpayer`: declaración explícita.
- `taxes`: override por nombre de impuesto, con tasa y habilitación.
- `disclaimerOverride`: texto legal alternativo.

Los impuestos desconocidos se conservan, pero el resolver los ignora. El país sigue siendo la fuente de defaults y `countryCode` desconocido produce un error visible.

Código: `packages/shared/src/documents/fiscal-profile.ts:26`, `packages/shared/src/documents/fiscal-profile.ts:86`.

## 9. Qué significa `isFormalTaxpayer: true` hoy

Hoy significa únicamente:

> “Esta organización afirma que es contribuyente formal.”

No significa:

- Que FitStack lo haya verificado.
- Que el documento sea una factura fiscal.
- Que exista numeración oficial.
- Que haya conexión con una autoridad tributaria.
- Que FitStack asuma obligaciones fiscales.

Es un dato de preparación para un futuro régimen homologado, no un efecto fiscal inmediato.

## 10. Gate de la etiqueta del documento

La etiqueta visible se decide con tres condiciones simultáneas:

1. `taxId` no vacío.
2. `isFormalTaxpayer === true`.
3. Homologación fiscal real conectada.

Si falta cualquiera, el documento dice:

> **Comprobante de pago**

Hoy la homologación es la constante explícita:

```ts
HAS_FISCAL_HOMOLOGATION = false
```

Por construcción, ningún comprobante actual puede decir “Factura”.

Código: `packages/shared/src/documents/document-label-gate.ts:16`, `packages/shared/src/documents/document-label-gate.ts:36`, `packages/shared/src/documents/receipt-compose.ts:128`.

La etiqueta solicitada por el emisor no es un parámetro del gate. Por eso el campo `documentLabel` se presenta como solo lectura: evita prometer un título que el sistema no puede aplicar legalmente.

## 11. Qué ofrecemos a una organización homologada hoy

Hoy ofrecemos **preparación, no facturación fiscal**:

- Guardar su declaración formal.
- Guardar su identificación fiscal.
- Guardar una etiqueta solicitada para futura referencia.
- Personalizar impuestos internos y disclaimer.
- Emitir comprobantes internos consistentes con su identidad.
- Exportar/descargar y reenviar el documento.
- Mantener trazabilidad interna por número correlativo.

No ofrecemos todavía:

- Emisión de factura electrónica.
- Numeración oficial.
- Integración con proveedor tecnológico autorizado.
- Transmisión a autoridad tributaria.
- Cambio automático de etiqueta a “Factura”.
- Asesoría o determinación fiscal.

## 12. Qué tendría que cambiar para soportar una org homologada

Para pasar de preparación a facturación fiscal real habría que implementar, como mínimo:

1. Fuente de verdad para homologación por país y por organización.
2. Integración con el proveedor o mecanismo oficial correspondiente.
3. Numeración fiscal oficial separada de la numeración interna actual.
4. Envío, acuse, rechazos y reintentos contra el sistema fiscal.
5. Congelamiento legal del documento oficial aceptado.
6. Manejo de anulaciones/notas de crédito según la norma local.
7. Actualización del disclaimer para indicar factura fiscal real.
8. Revisión de responsabilidades, términos y textos del producto.
9. Pasar `hasFiscalHomologation: true` solamente cuando exista conexión real.
10. Pruebas específicas por país y por proveedor.

Mientras eso no exista, la única etiqueta válida sigue siendo “Comprobante de pago”.

## 13. Estructura del código

- Reglas fiscales puras y compartidas:
  - `packages/shared/src/documents/document-label-gate.ts`
  - `packages/shared/src/documents/fiscal-profile.ts`
  - `packages/shared/src/documents/tax-math.ts`
  - `packages/shared/src/documents/receipt-compose.ts`
  - `packages/shared/src/documents/receipt-data.ts`
  - `packages/shared/src/documents/masking.ts`
- Emisión en `api-worker`:
  - `apps/api-worker/src/services/receipts.service.ts`
  - `apps/api-worker/src/services/subscriptions.service.ts`
  - `apps/api-worker/src/services/organizations.service.ts`
  - `apps/api-worker/src/routes/payments.route.ts`
  - `apps/api-worker/src/routes/organizations.route.ts`
- Persistencia compartida:
  - `packages/database/src/repositories/receipts.repository.ts`
- Render y correo en `jobs-worker`:
  - `apps/jobs-worker/src/handlers/receipt.handler.ts`
  - `apps/jobs-worker/src/handlers/pdf.handler.ts`
  - `apps/jobs-worker/src/handlers/email.handler.ts`
  - `apps/jobs-worker/src/templates/payment-receipt-short.ts`

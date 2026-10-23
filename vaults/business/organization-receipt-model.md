# Modelo de emisión de comprobantes por la organización

> Alcance: **Panel**, relación organización (gym) → miembro. Producto sin homologación fiscal conectada.
> Ver también: [`fiscal-documents.md`](./fiscal-documents.md) (gate e impuestos), [`responsibilities.md`](./responsibilities.md), [`../guides/receipt-engine.md`](../guides/receipt-engine.md).

## 1. Qué significa "facturar" en FitStack

Cuando una organización factura, no emite una factura fiscal ante una autoridad. Hace esto:

1. Registra un pago.
2. Lo valida.
3. Emite un **comprobante de pago interno**, numerado y con PDF inmutable.
4. Lo pone a disposición del miembro por descarga y/o correo.

FitStack **no presenta, declara, retiene ni paga impuestos** por la organización, y **no transmite documentos** a SENIAT, DIAN, SAT, AFIP, SII ni SUNAT.

## 2. Quién es quién

- **Vendedor legal:** la organización/gym.
- **Comprador:** el miembro.
- **FitStack:** proveedor de registro, cálculo interno, documento y distribución.
- **Responsable fiscal de la venta:** exclusivamente la organización.

La declaración `isFormalTaxpayer` es una afirmación de la propia organización que FitStack registra desde Console; no la verifica.

## 3. Flujo cuando un pago queda validado

**Entrada:** alta directa con pago validado, cambio de `processing` a `validated`, o emisión manual (`POST /api/payments/:id/issue`). Si el pago se anula después, el comprobante se conserva y se marca **ANULADO**; el número nunca se libera.

**Paso 1 — emisión (síncrona, `api-worker`):** exige pago validado (`409 NOT_VALIDATED`), reutiliza el número si ya existía, calcula el año en la zona horaria de la organización, reclama el pago (claim-then-number), reserva el correlativo anual, calcula el desglose en centavos con `computeInclusiveTaxes` desde `COUNTRIES`, persiste número, fecha de emisión y desglose, y encola el render. No envía correo.

**Paso 2 — PDF y aviso (asíncrono, `jobs-worker`):** lee pago, organización, miembro y suscripción con aislamiento por organización, arma `ReceiptData` con el mismo builder que la API, ejecuta el checklist previo al PDF, renderiza, guarda en R2 con key determinista, marca `receipt_pdf_key` de forma condicional, marca `receipt_notified_at` y encola `email.payment_receipt`. Si el envío falla, limpia la marca para que la cola reintente. No genera un segundo PDF ni un segundo correo.

Detalle de la secuencia y del barrido: [`../guides/receipt-engine.md`](../guides/receipt-engine.md).

**Qué recibe el miembro:** un correo corto con el PDF adjunto. El PDF se lee de R2 (no se regenera), es byte a byte el mismo del Panel, y asunto y cuerpo usan el número correlativo humano, nunca el UUID del pago. Los pagos anteriores al sistema correlativo pueden enviarse sin adjunto como caso histórico terminal.

**Estados expuestos por el Panel:** `ready` (descargable), `pending` (numerado, PDF en preparación), `pre_system` (pago anterior al correlativo).

## 4. Qué contiene el comprobante

- Identidad emisora congelada: nombre, razón social si existe, identificación fiscal si existe, dirección y país.
- Etiqueta aplicada por el gate.
- Número correlativo humano por organización y año.
- Receptor: nombre del miembro y documento si existe.
- Venta: nombre del plan desde snapshot, periodo, fecha de pago frente a fecha de emisión.
- Montos en centavos: subtotal, líneas de impuesto, total, moneda pagada y tasa cuando corresponde.
- Método de pago con detalles enmascarados.
- Disclaimer del país del emisor (o el override de la organización).
- Sello `ANULADO` en los bytes del PDF cuando aplica (`receipt_voided_pdf_key`), no solo en la UI.
- `internalPaymentId` solo para trazabilidad interna, nunca visible.

## 5. De qué nos encargamos

Registrar monto, moneda, tasa, método, fechas y estado. Calcular el desglose en centavos sin inventar valores. Numerar por organización y año. Congelar snapshots del plan y del emisor. Generar un PDF determinista e inmutable y guardarlo en R2 con key determinista. Enmascarar referencias sensibles. Mostrar la etiqueta honesta del documento. Ofrecer descarga, reenvío y estados. Mantener aislamiento estricto por organización. Rechazar configuraciones inválidas de forma visible. No asumir país, moneda, zona horaria ni condición fiscal.

## 6. De qué NO nos encargamos

Determinar si una organización es contribuyente formal. Verificar un RIF, NIT, RUC o CUIT. Declarar, retener, pagar o compensar impuestos. Enviar comprobantes a una autoridad tributaria. Generar numeración fiscal oficial. Convertir un comprobante interno en factura electrónica. Usar la palabra "Factura" sin homologación real. Sustituir al contador ni al sistema contable de la organización.

## 7. Responsabilidad de la organización

- Registrar su identidad legal verdadera: razón social, identificación fiscal y dirección.
- Mantenerla completa mientras FitStack declara `isFormalTaxpayer` desde Console.
- Mantener actualizados el disclaimer y sus datos emisores (las tasas las define `COUNTRIES`).
- Decidir si una venta requiere factura fiscal y usar un proveedor homologado o su contador cuando la ley lo exija.
- Cumplir IVA/IGV, IGTF u otras obligaciones aplicables.
- Conservar su documentación fiscal fuera de FitStack cuando corresponda.

Activar `isFormalTaxpayer` no transfiere responsabilidad a FitStack.

## 8. Cómo se configura la identidad fiscal

La organización edita su perfil emisor con `PATCH /api/organizations/profile` (`ORGANIZATION.UPDATE`): `legalName`, `taxId`, `address` y `fiscalConfig.disclaimerOverride`.

- El régimen fiscal (`fiscalConfig.isFormalTaxpayer`) es **platform-only**: se escribe desde Console (`PATCH /api/platform/organizations/:id`). La ruta del tenant responde **403 `FISCAL_CONFIG_PLATFORM_ONLY`** si intenta enviarlo (también las claves legadas `taxes`/`confirmedTaxes` o un `fiscalConfig: null`), sin escritura parcial.
- `countryCode` y `primaryCurrency` son inmutables después de la creación.
- `fiscalConfig` se fusiona, no se reemplaza: un PATCH parcial de `disclaimerOverride` conserva `isFormalTaxpayer`.
- Console solo activa `isFormalTaxpayer` con identidad completa (**400 `FISCAL_IDENTITY_INCOMPLETE`**).
- Se invalida el perfil cacheado de la sesión.
- `fiscalConfig` acepta solo `documentLabel` (solo lectura en producto), `isFormalTaxpayer` y `disclaimerOverride`; cualquier otra clave es 400. Las tasas no se configuran por organización: viven en `COUNTRIES`.
- Un `countryCode` desconocido produce un error visible.

## 9. Qué significa `isFormalTaxpayer: true` hoy

Únicamente: "esta organización se declara contribuyente formal (FitStack lo registra desde Console a su solicitud)".

No significa que FitStack lo haya verificado, que el documento sea una factura fiscal, que exista numeración oficial, que haya conexión con una autoridad ni que FitStack asuma obligaciones fiscales. Es un dato de preparación para un futuro régimen homologado.

La etiqueta visible la decide el gate de tres condiciones: [`fiscal-documents.md`](./fiscal-documents.md) §3–§4.

## 10. Qué ofrecemos hoy a una organización formal

Preparación, no facturación fiscal: declaración formal gestionada desde Console, edición de su identificación fiscal, etiqueta solicitada guardada para futura referencia, disclaimer personalizable, comprobantes internos consistentes con su identidad, descarga y reenvío, y trazabilidad por número correlativo.

No ofrecemos: factura electrónica, numeración oficial, integración con proveedor autorizado, transmisión a autoridad tributaria, cambio automático de etiqueta a "Factura", ni asesoría fiscal.

## 11. Qué haría falta para una org homologada

1. Fuente de verdad de homologación por país y por organización.
2. Integración con el proveedor o mecanismo oficial.
3. Numeración fiscal oficial separada de la interna.
4. Envío, acuse, rechazos y reintentos contra el sistema fiscal.
5. Congelamiento legal del documento aceptado.
6. Anulaciones y notas de crédito según la norma local.
7. Disclaimer que indique factura fiscal real.
8. Revisión de responsabilidades, términos y textos del producto.
9. Habilitar la etiqueta "Factura" en el gate (`HAS_FISCAL_HOMOLOGATION`), que hoy no forma parte de `FiscalConfigSchema` (400).
10. Pruebas por país y por proveedor.

Mientras eso no exista, la única etiqueta válida sigue siendo "Comprobante de pago".

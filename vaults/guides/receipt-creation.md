# Cómo se crea un comprobante correcto (Panel y Console)

> Guía de emisión. Contrato congelado: [`../business/receipts.md`](../business/receipts.md). Cómo está construido el motor: [`receipt-engine.md`](./receipt-engine.md).

## Principios

1. **El UUID del pago nunca se muestra** como número de comprobante: es una clave técnica interna. El número es un campo humano, correlativo y separado.
2. **Todo dato impreso viene de snapshots**, nunca de tablas en vivo. Si el plan cambia después, el comprobante emitido no cambia.
3. **Moneda y tasa siempre juntas** cuando el pago fue en una moneda distinta a la del plan, con el equivalente en la moneda base.
4. **El disclaimer legal del país del emisor va al pie**, tomado de `COUNTRIES[code].legalDisclaimer`. Sin país configurado, el pie es genérico y no fiscal.
5. **La etiqueta la decide el gate**, no la configuración: mientras no exista homologación real, todo dice "Comprobante de pago".
6. **Monto pagado y monto base son dos campos**: `amountPaid` (lo que pagó el cliente, en centavos enteros, sin sufijo `_cents`) y `planSnapshotPrice` (el monto base congelado). Nunca se divide `amountPaid` por la tasa para reconstruir el base.

## A. Console — la organización paga a FitStack

**Emisor:** FitStack (una sola entidad legal). **Receptor:** la organización. **Origen:** `platform_subscription_payment`.

### Numeración

Una **única secuencia global y continua**, sin año: `FS-0000001`, `FS-0000002`, …

- `platform_document_sequence` guarda el **último** número entregado (`last_number`), no el siguiente.
- La emisión es **claim-then-number**, igual que en el Panel: primero se reclama el pago y después se consume la secuencia, así dos emisiones simultáneas no queman un `FS-N`.
- La asignación es un `INSERT … ON CONFLICT DO UPDATE … RETURNING` sobre esa secuencia: sin transacción interactiva y sin `SELECT … FOR UPDATE`.
- Un pago de $0 (plan `price = 0`) nace validado pero **no** quema número: queda como `pre_system`, igual que un pago anterior al sistema correlativo.

### Campos

| Sección | Campo | Origen |
|---|---|---|
| Emisor | `legalName`/`name`, `taxId` | `platform_setting` (`fitstack_*`) |
| Etiqueta y disclaimer del emisor | `taxLabel` y disclaimer del país **del emisor** (`fitstack_country_code`) | `COUNTRIES`; sin país → `Tax ID` + pie no fiscal |
| Receptor | `legalName`/`name`, `taxId` con `taxLabel` del país del receptor (`R.I.F.`, `NIT`), `address` | `organization` |
| Identificación | `receiptNumber` (`FS-N`) | `platform_document_sequence` |
| Detalle | `planSnapshotName`, `planSnapshotCurrency`, `planSnapshotDurationValue/Unit` | snapshot del pago, nunca el plan en vivo |
| Periodo | `startDate` → fin según la duración congelada | suscripción SaaS |
| Montos | `amountPaid`, `currencyPaid`, `exchangeRateApplied`, **`planSnapshotPrice`** como monto base | pago |
| Método | `paymentMethod`, `paymentMethodDetails` (enmascarado) | pago |
| Fechas | fecha de pago vs fecha de emisión (UTC) | pago |
| Pie | disclaimer del emisor + "Emitido por FitStack" | país del emisor |

`featuresSnapshot` no se imprime: es entitlement interno, no facturación.

## B. Panel — el miembro paga al gimnasio

**Emisor:** la organización (cada gym es un emisor distinto). **Receptor:** el miembro. **Origen:** `payment`.

### Numeración

Secuencia **por organización y por año local**: `2026-000045`, `2026-000046`, … El año se calcula en la zona horaria de la organización.

- `organization_document_sequence` tiene PK `(organization_id, document_type, year)` y `last_number` guarda el **último** entregado.
- **El número no lleva el slug del gimnasio.** El slug solo se parsea al leer comprobantes legacy; los emitidos hoy son `{año}-n`.
- La emisión es **claim-then-number**: primero se reclama el pago (`UPDATE … WHERE receipt_claim_at IS NULL AND receipt_number IS NULL`, que además persiste desglose, snapshot y actor) y solo después se asigna el número. Una emisión concurrente pierde el reclamo en lugar de competir por la secuencia, así que no quema un correlativo.
- El reclamo nunca se libera: el barrido lo reanuda. Un reclamo sobre un pago compensado o anulado es terminal.

### Campos

| Sección | Campo | Origen |
|---|---|---|
| Emisor | `legalName`/`name`, `taxId`, `address` | `organization` |
| Etiqueta y disclaimer | gate + país del **emisor** (`organization.countryCode`) | `COUNTRIES` |
| Receptor | nombre del miembro y documento con `docLabel` (`C.I.`, `C.C.`) | `gym_member` |
| Identificación | `receiptNumber` (`{año}-n`) | secuencia de la organización |
| Detalle | `planSnapshotName`, `planSnapshotCurrency` | snapshot del pago |
| Periodo | `subscription.startDate` → `endDate` | suscripción |
| Montos | `amountPaid`, `currencyPaid`, `exchangeRateApplied`, **`planSnapshotPrice`** como monto base | pago |
| Impuestos | `subtotal`, `taxTotal`, `taxDetails` (perfil del país; apagados salvo contribuyente formal) | pago + config de país |
| Método | `paymentMethod`, `paymentMethodDetails` (enmascarado) | pago |
| Fechas | fecha de pago vs fecha de emisión | pago |
| Pie | disclaimer del país del gym + "Generado con FitStack" | config de país |

## C. Ciclo de vida del documento

1. **Emisión (síncrona, `api-worker`)**: se decide la etiqueta, se congela el snapshot del emisor, se reclama el pago y se asigna el número. Se encola el render. Nunca se envía correo aquí.
2. **Render (asíncrono, `jobs-worker`)**: se compone desde el snapshot, se sube el PDF a R2 con una key determinista, se marca listo con un gate idempotente y se encola el correo del mismo PDF.
3. **Barrido**: repara cinco estados — reclamo vencido, numerado sin PDF, PDF sin aviso, anulado sin PDF sellado y anulado sin flag. Cada uno con su condición idempotente.
4. **Anulación**: el número y el PDF de emisión quedan intactos; se genera un PDF nuevo con el sello `ANULADO` (`<n>-anulado.pdf`). Hasta que exista, el original no se entrega (fail-closed) y el reenvío responde `409 RECEIPT_VOIDED`.
5. **Reenvío / reintento**: `POST /:id/issue` (Panel) y `POST .../resend` (Console) reutilizan el número existente; nunca renumeran.

## D. Comparativa rápida

| | Console | Panel |
|---|---|---|
| Emisor | FitStack (único) | Cada gimnasio |
| Receptor | Organización | Miembro |
| Numeración | Global continua `FS-N` | Por organización y año local `{año}-n` |
| Impuestos | `COUNTRIES` (SSOT) | `COUNTRIES` (SSOT) |
| ¿Puede decir "Factura"? | No (sin homologación) | No (sin homologación) |

## E. Antes del primer PDF real

- [ ] El número se asigna al **validar** el pago, nunca al crear el registro ni al renderizar el PDF.
- [ ] El número no se reutiliza ni se recicla aunque el pago se anule después.
- [ ] El UUID técnico no aparece en ningún lugar visible del PDF.
- [ ] El disclaimer corresponde al país **del emisor**, no al del receptor.
- [ ] Un pago en moneda distinta a la del emisor muestra la tasa aplicada y el equivalente en la moneda base tomado de `planSnapshotPrice`.
- [ ] El emisor tiene identidad completa (`legalName`, `taxId`, `address`) si va a declararse contribuyente formal.

# Motor de comprobantes — cómo está construido

> **Alcance:** el motor unificado que emite los comprobantes de pago del Panel (gym) y del Console (SaaS).
> Contrato congelado y detalle por regla: [`../business/receipts.md`](../business/receipts.md). Semántica de estados: [`../business/payment-statuses.md`](../business/payment-statuses.md).

## 1. Dos pasos, nunca uno

| Paso | Dónde | Qué hace | Qué NO hace |
|---|---|---|---|
| **1. Emisión** | `api-worker`, en la petición que valida el pago | Reclama el pago, decide la etiqueta, congela el snapshot del emisor, persiste el desglose y asigna el número | No genera PDF ni envía correo |
| **2. Render y aviso** | `jobs-worker`, por cola | Compone el PDF desde el snapshot, lo sube a R2 y encola el correo | No numera, no escribe el actor |

El correo sale **solo** del paso 2, cuando el PDF ya existe.

## 2. Paso 1 — claim-then-number

El número es un recurso escaso: dos emisiones simultáneas no deben quemar un correlativo.

1. **Reclamo** (`claim*Receipt`): una sola sentencia `UPDATE … WHERE receipt_claim_at IS NULL AND receipt_number IS NULL` que escribe `receipt_claim_at`, `subtotal`/`tax_total`/`tax_details`, `emitter_snapshot` y `issued_by`. Solo una petición gana.
2. **Número**: `INSERT … ON CONFLICT DO UPDATE … RETURNING` sobre la secuencia (una sola sentencia, sin transacción interactiva).
3. **Adjuntar**: segundo `UPDATE … WHERE receipt_number IS NULL AND receipt_claim_at IS NOT NULL` que escribe el número, `receipt_issued_at` y `document_type`.
4. **Encolar** el render.

Si la petición muere entre 1 y 3, el pago queda reclamado sin número: el barrido lo retoma y lo numera sin repetir. El reclamo **nunca se libera**, solo se reanuda. Un reclamo sobre un pago compensado o anulado es terminal: ese pago no se numera.

Reclamar antes de numerar es lo que evita que dos emisiones compitan por la secuencia y dejen un hueco.

## 3. Numeración

| Emisor | Formato | Universo | Año |
|---|---|---|---|
| Panel (gym) | `{año}-n` → `2026-000045` | Por organización | Año **local** del emisor |
| Console (SaaS) | `FS-n` → `FS-0000001` | Global y continuo | Sin año |

El número es correlativo, humano y visible. El UUID del pago nunca se muestra.

## 4. Paso 2 — PDF y correo

1. Compone el documento **leyendo el snapshot**, no la configuración actual.
2. Renderiza y sube a R2 con una key determinista: `receipts/<slug>/<año>/<n>.pdf` (Panel) y `platform/receipts/<año-UTC>/FS-<n>.pdf` (Console). Un reintento reescribe el mismo objeto con el mismo contenido.
3. Marca el PDF con un gate idempotente: `UPDATE … WHERE receipt_pdf_key IS NULL RETURNING` (`rowCount === 1`).
4. Encola el correo. Si el envío falla se limpia la marca (`clearReceiptNotified`) y el barrido lo recupera; la marca también se limpia en el intento final que cae a la DLQ, para que el barrido no deje un PDF sin entrega.

Nada se manda desde el paso 1: el PDF es la fuente de verdad y el correo una notificación corta con ese mismo archivo adjunto.

## 5. Barrido de reparación

Un cron de `jobs-worker` re-encola lo que quedó a medias. Cada pieza tiene su propia condición idempotente, así que repetirlo no duplica nada, y una fila corrupta no aborta el resto.

| # | Estado que repara | Condición | Efecto |
|---|---|---|---|
| 1 | Reclamo vencido | reclamado hace ≥15 min, sin número, y sigue `validated` | Reanuda la emisión y numera |
| 2 | Numerado sin PDF | número asignado hace ≥15 min | Re-encola el render |
| 3 | PDF listo sin aviso | PDF presente y sin notificar hace ≥30 min | Re-encola el correo |
| 4 | Anulado sin PDF sellado | `receipt_voided` y falta el PDF con sello hace ≥15 min | Re-encola el render del sello |
| 5 | Anulado sin flag | el pago dice `voided` y `receipt_voided` está en falso hace ≥15 min | Enciende **solo** el flag y encola el sello si esta corrida lo encendió |

El caso 5 existe porque los demás predicados buscan el flag **encendido**: sin él la fila era invisible y se seguía sirviendo el PDF original. `flag*VoidedIfMissing` conserva `voided_by`/`voided_at`/`void_reason` tal cual y nunca inventa un actor.

## 6. ANULADO es un artefacto

- El número y el PDF de emisión quedan **intactos** (write-once).
- Se genera un **segundo** PDF con el sello: `<n>-anulado.pdf`, guardado en `receipt_voided_pdf_key`.
- Mientras ese sello no exista, el contrato responde `pending` y `/receipt/pdf` da 404: **fail-closed**. Un comprobante anulado nunca viaja sin su sello.
- Anular encola el render del sello (paso 1-bis) y el barrido es la red de seguridad.
- El reenvío por correo responde **409 `RECEIPT_VOIDED`** y un evento ya en vuelo también se descarta en el handler.

## 7. Snapshot del emisor

El reclamo congela: `version`, emisor (nombre, razón social, identificación fiscal, etiqueta del país, dirección, país, moneda), la etiqueta que aplicó el gate, la etiqueta del documento del receptor, el disclaimer, la zona horaria de impresión y el perfil fiscal resuelto.

- La composición lee **primero el snapshot** y no evalúa la configuración en vivo: un comprobante histórico no cambia aunque el emisor edite su perfil.
- `NULL` = emitido antes de que el snapshot existiera (migración `0016`): se compone en vivo. Es un estado terminal documentado.
- Un snapshot presente pero inválido **lanza** error: nunca degrada en silencio.
- La etiqueta del receptor es estructural: organización → `taxLabel` (`R.I.F.`, `NIT`); persona → `docLabel` (`C.I.`, `C.C.`).

## 8. Etiqueta y gating fiscal

- `resolveDocumentLabel` exige tres condiciones: identificación fiscal cargada, emisor que se declara contribuyente formal y homologación fiscal real. La tercera es la constante `HAS_FISCAL_HOMOLOGATION = false`, así que hoy todo documento dice **Comprobante de pago**. El gate no acepta override.
- `isFormalTaxpayer` se escribe **solo desde Console** (`PATCH /api/platform/organizations/:id`) y solo con identidad completa (`legalName` + `taxId` + `address`). La ruta del tenant responde **403 `FISCAL_CONFIG_PLATFORM_ONLY`**.
- Mientras esté apagado: `subtotal = amountPaid`, `taxTotal = 0`, `taxDetails = []`. Encendido, se aplica el perfil del país del emisor (`COUNTRIES`, SSOT) con `computeInclusiveTaxes` en el servidor, sin override manual.
- El equivalente en moneda base es el `plan_snapshot_price` congelado, nunca una división por la tasa (`RD-157`). La división solo sobrevive como respaldo de filas históricas.

## 9. Contrato y auditoría

- `GET /:id/receipt` → 200 `ready` · 202 `pending` · 200 `available:false, reason:'pre_system'` (nunca 409).
- `GET /:id/receipt/pdf` → binario.
- `POST /:id/issue` → reintento manual (owner/manager/cashier).
- Auditoría de la serie: `GET /api/reports/receipts` (Panel) y `GET /api/platform/subscriptions/receipts` (Console) devuelven filas, totales por moneda y `gaps[]` (`1..último`, clasificando `hueco` vs `anulado`).
- El emisor SaaS escribe su identidad en `platform_setting` (`fitstack_*`); vacío = emisor genérico y etiqueta sin régimen fiscal.

## 10. Dónde vive cada pieza

| Pieza | Archivo |
|---|---|
| Núcleo del paso 1 + puerto `IssuerProfile` | `apps/api-worker/src/services/receipt-issue.core.ts` |
| Perfiles de emisor (Panel / Console), paso 1 | `apps/api-worker/src/services/receipts.service.ts`, `platform-receipts.service.ts` |
| Perfiles de render, paso 2 | `apps/jobs-worker/src/handlers/render-profile.ts` |
| Selector de perfil + barrido | `apps/jobs-worker/src/handlers/receipt.handler.ts` |
| Correo del comprobante | `apps/jobs-worker/src/handlers/pdf.handler.ts`, `email.handler.ts` |
| Reglas puras (gate, fiscal, impuestos, composición) | `packages/shared/src/documents/` |
| Persistencia compartida (excepción de repo) | `packages/database/src/repositories/receipts.repository.ts`, `platform-receipts.repository.ts` |

El paso de cada emisor vive **una sola vez**; cada emisor aporta un perfil pequeño. Los dos repos compartidos son la única excepción al aislamiento por app (dos runtimes necesitan el mismo SQL).

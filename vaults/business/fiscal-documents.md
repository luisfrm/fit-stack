# Documentos fiscales y comprobantes de pago

> Referencia interna. Ver también: [`receipts.md`](./receipts.md) (contrato del motor), [`organization-receipt-model.md`](./organization-receipt-model.md) (qué emite la organización), [`payment-statuses.md`](./payment-statuses.md), [`responsibilities.md`](./responsibilities.md).

## 1. Qué emitimos hoy

FitStack emite **comprobantes de pago**. No emite facturas fiscales, no declara impuestos y no está conectado a ninguna autoridad tributaria.

Un documento solo puede llamarse **"Factura"** si se cumplen tres condiciones a la vez; hoy la tercera es imposible, así que todo sale como **"Comprobante de pago"**, en Panel y en Console.

| | Comprobante de pago | Factura fiscal |
|---|---|---|
| Qué es | Registro interno de que un pago ocurrió | Documento con validez tributaria |
| Quién lo autoriza | El sistema | La autoridad del país (SENIAT, DIAN, SAT…) |
| Numeración | Interna de FitStack | Oficial, homologada |
| ¿Lo emitimos hoy? | **Sí** | **No** |

## 2. Los dos interruptores

Son cosas distintas y no se sustituyen entre sí.

### 2.1 `isFormalTaxpayer` — ¿el emisor declara impuestos?

- Vive solo en `organization.fiscalConfig`, por organización, y **solo lo escribe Console**. El tenant recibe **403 `FISCAL_CONFIG_PLATFORM_ONLY`** si intenta enviarlo.
- El emisor SaaS (FitStack) no tiene este interruptor: está fijado en `false` y ningún setting lo activa.
- Activarlo exige identidad completa (`legalName` + `taxId` + `address`); si falta algo, **400 `FISCAL_IDENTITY_INCOMPLETE`** sin escritura parcial.
- `false`: el comprobante no desglosa impuestos (`subtotal = amountPaid`, `taxTotal = 0`, `taxDetails = []`). `true`: muestra el desglose del país según `COUNTRIES`.

### 2.2 `HAS_FISCAL_HOMOLOGATION` — ¿estamos conectados al fisco?

- Es una constante `false` en `packages/shared/src/documents/document-label-gate.ts`. No hay variable de entorno ni endpoint que la cambie.
- Significa: no existe integración con máquinas fiscales ni con un proveedor homologado.
- Vive en un solo lugar a propósito: el día que exista homologación real se cambia ahí y el gate lo aplica.

### 2.3 La diferencia que importa

**Impuestos ≠ factura.** Si mañana se activara `isFormalTaxpayer`, el comprobante mostraría IVA/IGTF pero seguiría llamándose "Comprobante de pago". Para decir "Factura" hacen falta las dos cosas, más la identificación fiscal cargada.

## 3. Las tres condiciones para llamar "Factura"

1. El emisor se declara contribuyente formal → `isFormalTaxpayer: true`.
2. Tiene identificación fiscal cargada → `taxId` no vacío.
3. Existe homologación real → `HAS_FISCAL_HOMOLOGATION: true`.

Las tres son obligatorias. Hoy (1) puede ser `true`, (2) puede estar cargado y (3) **siempre es `false`**: la etiqueta "Factura" es inalcanzable por construcción, no por un bug.

Se evalúan sobre el **emisor**, nunca sobre el receptor. El marco fiscal (etiqueta del `taxId` y disclaimer) sale del país del emisor: un emisor venezolano que factura a una organización colombiana imprime `R.I.F.` para sí y `NIT` para el receptor, con el disclaimer del SENIAT. En Console el país del emisor es `fitstack_country_code`; vacío = emisor genérico (`Tax ID` + disclaimer no fiscal), nunca el país del receptor como proxy.

## 4. El gate

Una sola función pura, sin override:

```ts
// packages/shared/src/documents/document-label-gate.ts
resolveDocumentLabel({ taxId, isFormalTaxpayer })
```

| `taxId` | `isFormalTaxpayer` | Homologación | Resultado |
|---|---|---|---|
| vacío | cualquiera | `false` | Comprobante de pago |
| cargado | `false` | `false` | Comprobante de pago |
| cargado | `true` | `false` | Comprobante de pago |
| cargado | `true` | `true` | Factura *(futuro, hoy imposible)* |

Reglas fijas:

- **La etiqueta no se elige: la decide el gate.** Lo que llegue por configuración se ignora.
- **Se evalúa una vez, al emitir**, y se congela en `emitterSnapshot.documentLabel`.
- **El PDF no vuelve a evaluar**: lee el snapshot. Un recibo histórico conserva su etiqueta para siempre. La excepción son los emitidos antes de existir el snapshot (`emitter_snapshot = null`), que se recomponen con la configuración actual.

## 5. Flujo del comprobante

Emisión en **dos pasos**: el número se asigna en la petición y el PDF se genera después. El correo sale solo cuando el PDF existe. Detalle técnico: [`../guides/receipt-engine.md`](../guides/receipt-engine.md).

1. **Nace el pago**: `processing` (por validar) o `validated` (aprobado). Solo un pago `validated` emite comprobante; la única excepción es el pago de $0 de un plan `price = 0` en Console, que nace validado pero no numera (`pre_system`).
2. **Emisión (síncrona)**: se decide la etiqueta, se reclama el pago y se congela el snapshot del emisor, se asigna el número, se persiste todo junto y se encola el render. Nunca se envía correo aquí. Si el pago ya tiene número, se devuelve el existente; `POST /api/payments/:id/issue` permite reintentar a mano.
3. **PDF y correo (asíncrono)**: se compone leyendo el snapshot, se sube a R2 con key determinista, se marca el PDF como listo y se encola el correo. Si el envío falla, se revierte la marca para que el barrido lo recupere.
4. **Anulación**: el número no se libera ni se reutiliza; el PDF original queda intacto pero deja de entregarse y se genera un segundo PDF sellado `ANULADO`. Un anulado no se reenvía (`409 RECEIPT_VOIDED`) ni se re-valida.
5. **Barrido**: repara numerado sin PDF, PDF sin correo, anulado sin sello, reclamo vencido y anulado sin flag. Cada pieza tiene su condición idempotente.

## 6. Impuestos

Con `isFormalTaxpayer` en `false`:

```
subtotal   = amountPaid
taxTotal   = 0
taxDetails = []
```

No se imprime ninguna línea de IVA ni de IGTF y ningún monto cambia. Cuando se active:

- `COUNTRIES` define tasas y condiciones; ninguna organización puede cambiarlas.
- El desglose se calcula siempre en el servidor con `computeInclusiveTaxes`; no hay override manual.
- El IGTF venezolano es condicional: aplica solo si el pago no es en VES y se extrae del total bruto antes de descomponer el IVA.

## 7. Estructura del comprobante

**Encabezado:**

- `legalName` (si no existe, `name`).
- Identificación fiscal con la etiqueta del país **del emisor** (`R.I.F.`, `NIT`, `RFC`…). Sin `taxId`, la línea se omite: nunca se rellena con `---`.
- Dirección si está configurada.

**Identificación del documento:** etiqueta del gate, número correlativo visible (el UUID del pago nunca se muestra), fecha de pago y fecha de emisión.

**Receptor:**

- Panel: el miembro, con el `docLabel` de su país (`C.I.`, `C.C.`…).
- Console: la organización, con el `taxLabel` de **su** país (`R.I.F.`, `NIT`…). La etiqueta del receptor nunca se toma del emisor.

**Detalle de la venta:** nombre del plan desde el snapshot, periodo cubierto y **sin precio unitario** (`RD-163`): una sola línea de concepto con su total; un comprobante equivale a una suscripción de periodo completo.

**Montos:** `subtotal`, `taxDetails`, `taxTotal`, `amountPaid`, `currencyPaid`. Si la moneda pagada difiere de la del plan, se imprime la tasa (`1 {moneda del plan} = {tasa} {moneda pagada}`) y el equivalente, que es el **precio del plan congelado** (`plan_snapshot_price`) y no una división (`RD-157`).

**Pago:** método y referencia enmascarada (nunca números de cuenta completos).

**Pie:** disclaimer del país del emisor + "Generado con FitStack". Los disclaimers aclaran que el documento no es una factura fiscal (el de US lo dice en inglés como *non-tax document*). Sin país de emisor configurado, el pie es genérico y no fiscal.

### Dónde vive cada pieza

| Pieza | Archivo |
|---|---|
| Gate de la etiqueta | `packages/shared/src/documents/document-label-gate.ts` |
| Perfil fiscal y tasas por país | `packages/shared/src/documents/fiscal-profile.ts`, `packages/shared/src/constants.ts` |
| Cálculo de impuestos | `packages/shared/src/documents/tax-math.ts` |
| Composición del documento | `packages/shared/src/documents/receipt-compose.ts` |
| Secuencia de emisión (paso 1) | `apps/api-worker/src/services/receipt-issue.core.ts` |
| Render del PDF (paso 2) | `apps/jobs-worker/src/handlers/render-profile.ts` |
| Barrido de reparación | `apps/jobs-worker/src/handlers/receipt.handler.ts` |

## 8. Países e impuestos

| País | Impuesto | Tasa | Nota |
|---|---|---|---|
| VE | IVA | 16 % | IGTF condicional (solo si el pago no es en VES), definido en `conditionalTaxes` |
| CO | IVA | 19 % | — |
| MX | IVA | 16 % | La zona fronteriza (8 %) no está cubierta por el default nacional |
| AR | IVA | 21 % | — |
| CL | IVA | 19 % | — |
| PE | **IGV** (no "IVA") | 18 % | Tasa compuesta (IGV + Impuesto de Promoción Municipal) |
| ES | IVA | 21 % | — |
| US | — | — | Sin IVA nacional; el sales tax depende del estado |
| PA | ITBMS | 7 % | — |

Las tasas viven **solo** en `COUNTRIES`: se actualizan ahí cuando cambie el decreto, nunca por organización.

### Notas de Venezuela

- El IVA general es 16 %, pero el Ejecutivo puede moverlo entre 8 % y 16,5 % por decreto.
- El IGTF aplica a pagos en divisas o criptomonedas distintas al bolívar; la tasa es variable por decreto.
- El IGTF se expresa en bolívares: un pago que no sea en VES debería registrar `exchangeRateApplied`; sin él, el PDF de ese pago no se genera.

## 9. Identificación de personas y organizaciones

Se persiste como un solo string `"<tipo>-<número>"` (por ejemplo `V-12345678`, `C.C.-12345678`).

- Los prefijos válidos salen de `COUNTRIES[cc].docType`; la etiqueta visible, de `docLabel` (persona) o `taxLabel` (organización). Ningún label se escribe a mano en los formularios.
- El servidor valida el prefijo contra el país **antes de escribir**: un emisor VE no puede registrar un tipo de documento colombiano (**400 `DOCUMENT_TYPE_INVALID`** con los campos culpables).
- Tolerancias para no bloquear datos heredados: vacío, sin guion, valor sin cambios o token desconocido se aceptan. Se rechazan un prefijo de otro país y un prefijo colgante sin número (`V-`).

## 10. Checklist antes de habilitar facturación fiscal real

- [ ] Entidad legal constituida con identificación fiscal propia (FitStack o el gym).
- [ ] País fiscal del emisor configurado en Console (`fitstack_country_code`): define etiqueta y disclaimer del emisor.
- [ ] Proveedor homologado de facturación electrónica integrado.
- [ ] Numeración fiscal oficial conectada (no generada internamente).
- [ ] Máquina fiscal o servicio autorizado por país.
- [ ] Cambiar `HAS_FISCAL_HOMOLOGATION` a `true`.
- [ ] Disclaimer actualizado para reflejar que ahora sí es una factura fiscal.
- [ ] Confirmación explícita del gym de que asume esa responsabilidad.

Si falta cualquiera de los primeros cuatro, **no se habilita la etiqueta "Factura"**, aunque el gym diga estar registrado.

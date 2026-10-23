# Comprobantes de pago y facturación fiscal — guía de referencia

> Documento de referencia interna. Última revisión: oct 2026.
> Ver también: `[[receipts]]`, `[[ORGANIZATION_RECEIPT_MODEL]]`, `[[PAYMENT_STATUSES]]`, `[[RESPONSABILITIES]]`

## 0. Resumen en una frase

Hoy FitStack emite **comprobantes de pago**. No emite facturas fiscales, no calcula impuestos y no está conectado a ninguna autoridad tributaria.

Un documento solo puede llamarse **"Factura"** cuando se cumplen **tres condiciones a la vez**. Hoy la tercera es imposible, así que todo sale como **"Comprobante de pago"**.

## 1. Comprobante de pago vs. factura fiscal

| | Comprobante de pago | Factura fiscal |
|---|---|---|
| Qué es | Registro interno de que un pago ocurrió | Documento con validez tributaria |
| Quién lo autoriza | Nadie; lo emite el sistema | La autoridad del país (SENIAT, DIAN, SAT…) |
| Numeración | Interna de FitStack | Oficial, homologada |
| ¿FitStack lo emite hoy? | **Sí** | **No** |

**Regla:** mientras no exista homologación real conectada, todo documento generado por FitStack dice "Comprobante de pago", nunca "Factura". Aplica a los dos niveles: Panel (gym) y Console (SaaS).

## 2. Los dos interruptores

Son dos cosas distintas y **no se sustituyen entre sí**. Confundirlos es el error más común.

### 2.1 `isFormalTaxpayer` — ¿este emisor declara impuestos?

- Vive **solo** en `organization.fiscalConfig` (una organización), y lo escribe Console.
- El emisor SaaS (FitStack) **no tiene este interruptor**: su valor está fijado en `false` y no existe ningún setting que lo active.
- **Solo lo escribe Console.** El tenant no puede tocarlo: la API responde `403 FISCAL_CONFIG_PLATFORM_ONLY`.
- Si es `false`: el comprobante **no desglosa impuestos**. `subtotal = amountPaid`, `taxTotal = 0`, `taxDetails = []`.
- Si fuera `true`: el comprobante mostraría el desglose del país (`COUNTRIES` es la fuente de verdad).
- Activar la identidad fiscal exige `legalName` + `taxId` + `address`; si falta algo, la API responde `400 FISCAL_IDENTITY_INCOMPLETE`.

### 2.2 `HAS_FISCAL_HOMOLOGATION` — ¿estamos conectados al fisco?

- Vive en el código: `packages/shared/src/documents/document-label-gate.ts`.
- Es una **constante `false`**. No hay configuración, ni variable de entorno, ni endpoint que la cambie.
- Significa: "no hay integración con máquinas fiscales ni con un proveedor homologado".
- No hay planes de implementarla por ahora. Por eso vive en **un solo lugar**: el día que exista, se cambia ahí y el gate lo aplica.

### 2.3 La diferencia que importa

**Impuestos ≠ factura.** Si mañana se activara `isFormalTaxpayer`, el comprobante mostraría IVA/IGTF, pero **seguiría llamándose "Comprobante de pago"**, porque la homologación sigue apagada. Para llamarlo "Factura" hacen falta las dos cosas, más el RIF/NIT cargado.

## 3. Las tres condiciones para llamar "Factura" a un documento

Las tres son **obligatorias**. Si falta una, el documento es "Comprobante de pago":

1. **El emisor es declarante de impuestos** → `isFormalTaxpayer: true`.
2. **Tiene RIF/NIT cargado** → `taxId` no vacío.
3. **Existe homologación real** → `HAS_FISCAL_HOMOLOGATION: true`.

Hoy: (1) puede ser `true`, (2) puede estar cargado, (3) **siempre es `false`**. Por eso el resultado es siempre "Comprobante de pago".

> La condición 3 no es un olvido ni un bug: no existe integración con máquinas fiscales y no hay plan de tenerla. El código la deja como una constante explícita, el gate **no acepta ningún override**, así que la etiqueta "Factura" es **inalcanzable por construcción**.

## 4. Cómo se decide la etiqueta (el gate)

La decisión vive en una sola función pura:

```ts
// packages/shared/src/documents/document-label-gate.ts
resolveDocumentLabel({ taxId, isFormalTaxpayer })
```

La tercera condición es la constante `HAS_FISCAL_HOMOLOGATION`, que hoy vale `false`. El gate no acepta ningún override: siempre usa la constante.

| `taxId` | `isFormalTaxpayer` | Homologación real | Resultado |
|---|---|---|---|
| vacío | cualquiera | `false` | Comprobante de pago |
| cargado | `false` | `false` | Comprobante de pago |
| cargado | `true` | `false` | Comprobante de pago |
| cargado | `true` | `true` | Factura *(futuro, hoy imposible por construcción)* |

Tres reglas que no cambian:

- **La etiqueta no se elige: la decide el gate.** Cualquier etiqueta que llegue por configuración se ignora.
- **Se evalúa una sola vez, al emitir.** El resultado se congela en `emitterSnapshot.documentLabel` dentro del pago.
- **El PDF no vuelve a evaluar.** Lee el snapshot. Un recibo histórico conserva su etiqueta original para siempre, aunque el emisor cambie sus datos después. La excepción son los recibos emitidos antes de que existiera el snapshot (`emitter_snapshot = null`): esos se recomponen con la configuración actual.

## 5. El flujo completo de un comprobante

La emisión tiene **dos pasos**: el número se asigna en la petición (síncrono) y el PDF se genera después (asíncrono). El email sale solo cuando el PDF ya existe.

### Paso 0 — Nace el pago

Un pago se registra como `processing` (pendiente de aprobación) o `validated` (aprobado). Puede haber sido creado por el gym en el Panel o por un administrador en el Console.

**Regla fija:** solo un pago `validated` emite comprobante. Única excepción: en Console un pago de **$0** (trial/free) nace `validated` pero **no** numera ni quema la serie (`pre_system`). El Panel nunca omite.

### Paso 1 — Emisión (síncrona, en `api-worker`)

Ocurre en la misma petición que valida el pago:

1. **Se decide la etiqueta** con el gate de 3 condiciones (§4).
2. **Se congela el snapshot del emisor**: nombre legal, RIF/NIT, dirección, país, moneda, etiqueta aplicada, etiqueta del receptor, disclaimer, zona horaria y perfil fiscal (aunque los impuestos estén en cero). Esto es lo que hace que el recibo sea reproducible.
3. **Se asigna el número**:
   - Panel: formato `2026-000001`, correlativo **por organización** y **por año local**.
   - Console: formato `FS-0000001`, correlativo **global y continuo** (sin año).
4. **Se persiste todo junto**: número, fecha de emisión, etiqueta del snapshot, impuestos y actor que emitió (`issuedBy`).
5. **Se encola el render** del PDF. Nunca se envía el email desde aquí.

Dos detalles del paso 1: si el pago ya tiene número, se devuelve el existente sin consumir otro (idempotente); y `POST /api/payments/:id/issue` permite reintentar la emisión a mano (owner/manager/cashier).

### Paso 2 — PDF y email (asíncrono, en `jobs-worker`)

1. Se compone el documento **leyendo el snapshot**, no la configuración actual.
2. Se renderiza el PDF y se sube a R2 (`receipts/<slug>/<año>/<número>.pdf` en Panel; `platform/receipts/<año-UTC>/FS-<número>.pdf` en Console).
3. Se marca el PDF como listo (con una condición idempotente: `WHERE receipt_pdf_key IS NULL`).
4. Se encola el email. Si el envío falla, se revierte la marca para que el barrido lo recupere.

El PDF se escribe bajo una key determinista derivada del número. Un reintento reescribe el mismo objeto con el mismo contenido; nunca se crea un PDF distinto para el mismo número.

### Anulación (ANULADO)

- El número **nunca se libera ni se reutiliza**.
- El PDF original queda intacto, pero **deja de entregarse** en cuanto el pago está anulado.
- Se genera un **segundo PDF sellado** con la marca `ANULADO` (`<numero>-anulado.pdf`).
- Mientras ese sello no exista, la descarga responde "pendiente" (202/404): un comprobante anulado nunca viaja sin su sello.
- Un anulado no se reenvía por email (`409 RECEIPT_VOIDED`) ni se puede volver a validar.

### Reparación automática (barrido)

Un barrido periódico en `jobs-worker` re-encola lo que se quedó a medias:

- numerado sin PDF,
- PDF listo sin email,
- anulado sin PDF sellado.

Cada pieza tiene su propia condición idempotente, así que re-ejecutar el barrido no duplica nada.

### Recibos históricos

El snapshot es la fuente de verdad. Un recibo emitido antes de un cambio de configuración conserva su etiqueta, su disclaimer y sus impuestos originales. **Nunca se re-etiqueta.**

La única excepción son los recibos emitidos **antes de que el snapshot existiera** (`emitter_snapshot = null`): esos se recomponen con la configuración actual, porque no hay nada congelado que leer.

## 6. Impuestos: hoy apagados

Con `isFormalTaxpayer` en `false`:

```
subtotal  = amountPaid
taxTotal  = 0
taxDetails = []
```

No se imprime ninguna línea de IVA ni de IGTF y no cambia ningún monto. El cálculo existe, pero devuelve `subtotal = amountPaid`, sin líneas y con `taxTotal = 0`: un interruptor que solo Console puede encender y una sola fuente de verdad (`COUNTRIES`).

Cuando en el futuro se active:

- `COUNTRIES` define tasas y condiciones; ninguna organización puede cambiarlas.
- El desglose se calcula **siempre en el servidor** con `computeInclusiveTaxes`. No hay override manual.
- El IGTF venezolano es **condicional**: solo aplica si el pago no es en VES, y se extrae del total bruto antes de descomponer el IVA.

## 7. Estructura del comprobante

**Encabezado (identidad del emisor):**
- `legalName` (si no existe, `name`)
- `taxId` con su etiqueta del país (`R.I.F.`, `NIT`, `RFC`…). Si no hay `taxId`, la línea se omite: nunca se inventa ni se rellena con `---`.
- Dirección si está configurada.

**Identificación del documento:**
- Etiqueta resuelta por el gate (§4). Hoy siempre "Comprobante de pago".
- Número correlativo visible. El ID técnico del pago nunca se muestra.
- Fecha de pago y fecha de emisión.

**Receptor:**
- Panel: miembro (nombre y documento con `docLabel` del país: `C.I.`, `C.C.`…).
- Console: organización (nombre y `taxLabel` del país: `R.I.F.`, `NIT`…).

**Detalle de la venta:**
- Nombre del plan desde el snapshot (no el plan en vivo).
- Período cubierto (`startDate`–`endDate`).

**Desglose monetario:**
- `subtotal`, `taxDetails`, `taxTotal`, `amountPaid`, `currencyPaid`.
- Si `currencyPaid ≠ planSnapshotCurrency`: tasa aplicada (`numeric(20,10)`) y equivalente en la moneda del plan. La tasa se lee "1 {moneda del plan} = {tasa} {moneda pagada}", pero el equivalente **no** se obtiene dividiendo: es el monto base persistido — `plan_snapshot_price` en el Panel, `base_amount` en el Console (derivado en el servidor) — porque la división por una tasa redondeada distorsiona (RD-157). Solo las filas históricas sin ese monto base caen al fallback de división.

**Pago:** método y referencia enmascarada (nunca números de cuenta completos).

**Pie legal:** disclaimer del país (`COUNTRIES.legalDisclaimer`) + "Generado con FitStack". Los disclaimers actuales aclaran que el documento **no** constituye una factura fiscal (el de US lo indica en inglés como *non-tax document*).

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

## 8. Países e impuestos — referencia

| País | Impuesto | Tasa | Nota |
|---|---|---|---|
| VE | IVA | 16% | Además IGTF condicional (solo si el pago no es en VES), definido en `conditionalTaxes` |
| CO | IVA | 19% | — |
| MX | IVA | 16% | La zona fronteriza tiene tasa reducida (8%), no cubierta por el default nacional |
| AR | IVA | 21% | — |
| CL | IVA | 19% | — |
| PE | **IGV** (no "IVA") | 18% | Tasa compuesta (IGV + Impuesto de Promoción Municipal) |
| ES | IVA | 21% | — |
| US | — | — | No existe IVA nacional; el sales tax depende del estado |
| PA | ITBMS | 7% | — |

Las tasas viven **solo** en `COUNTRIES`. Se actualizan ahí cuando cambie el decreto, nunca por organización.

### Notas de Venezuela

- El IVA general es 16%, pero el Ejecutivo puede moverlo entre 8% y 16,5% por decreto.
- El IGTF aplica a pagos en divisas o criptomonedas distintas al bolívar. La tasa es variable por decreto.
- El IGTF se expresa en bolívares: un pago que no sea en VES **debería** registrar `exchangeRateApplied` (hoy la API lo acepta como opcional; sin él, el PDF de ese pago no se genera).

## 9. Identificación de personas y organizaciones

Se persiste como un solo string `"<tipo>-<número>"` (por ejemplo `V-12345678`, `C.C.-12345678`).

- Los prefijos válidos salen de `COUNTRIES[cc].docType`.
- La etiqueta visible sale de `docLabel` (persona natural) o `taxLabel` (organización). Ningún label se escribe a mano en los formularios.
- El servidor valida el prefijo contra el país **antes de escribir**: un emisor VE no puede registrar un tipo de documento colombiano. La API responde `400 DOCUMENT_TYPE_INVALID` con los campos culpables.
- Tolerancias para no bloquear datos heredados: vacío, sin guion, valor sin cambios o token desconocido se aceptan. Se rechazan un prefijo definido por **otro país** y un prefijo colgante sin número (por ejemplo `V-`).

## 10. Checklist antes de habilitar facturación fiscal real

Nada de esto está hecho. Es la lista completa de lo que haría falta:

- [ ] Entidad legal constituida con tax ID propio (FitStack) o del gym (Panel).
- [ ] Proveedor homologado de facturación electrónica integrado.
- [ ] Numeración fiscal oficial conectada (no generada internamente).
- [ ] Máquina fiscal o servicio autorizado por país (SENIAT, DIAN, SAT…).
- [ ] Cambiar `HAS_FISCAL_HOMOLOGATION` a `true`.
- [ ] Disclaimer legal actualizado para reflejar que ahora sí es una factura fiscal.
- [ ] Confirmación explícita del gym/organización de que asume esa responsabilidad.

Si cualquiera de los primeros cuatro falta, **no se habilita la etiqueta "Factura"**, aunque el gym diga estar registrado.

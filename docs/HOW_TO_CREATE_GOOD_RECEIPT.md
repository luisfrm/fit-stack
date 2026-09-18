# Cómo crear un comprobante correcto (Console vs. Panel)

> Documento de referencia interna. Última revisión: sept 2026.
> Ver también: `docs/RESPONSABILITIES.md`, `docs/FACTURATION.md`, `docs/PAYMENT_STATUSES.md`

## Principio general (aplica a ambos niveles)

1. **El UUID del pago (`payment.id` / `platformSubscriptionPayment.id`) nunca se muestra al cliente como "número de comprobante".** Es una clave técnica interna. El número de comprobante es un campo humano separado, generado aparte.
2. **Todo dato mostrado en el comprobante viene de snapshots, nunca de tablas "en vivo".** Si el plan cambia después, el comprobante ya emitido no debe cambiar.
3. **La moneda y la tasa de cambio aplicada siempre se muestran juntas** si el pago fue en una moneda distinta a la moneda principal del emisor.
4. **El disclaimer legal del país siempre va al pie**, tomado de la config de país (`COUNTRIES[code].legalDisclaimer`), nunca hardcodeado por documento.
5. **La etiqueta del documento** ("Comprobante de pago" vs "Factura") depende de si el emisor cumple las 3 condiciones descritas en `docs/FACTURATION.md` §2. El campo `documentLabel` es de solo lectura y no participa del gate.

---

## A. Nivel Console — Org paga a FitStack

**Emisor:** FitStack (una sola entidad legal, cuando exista con RIF/tax ID).
**Receptor:** la Organización (gym).
**Tabla fuente:** `platformSubscriptionPayment`.

### Numeración

Una **única secuencia global**, porque FitStack es un solo emisor para toda la plataforma:

```
platform_document_sequence
 ├─ document_type   -- 'receipt' | 'invoice'
 └─ next_number     -- guarda el ÚLTIMO número entregado (sin año). El nombre es cosmético
```

La asignación es una **única sentencia atómica** `INSERT … ON CONFLICT DO UPDATE … RETURNING` (sin transacción interactiva ni `SELECT … FOR UPDATE`), y `next_number` guarda el **último** número entregado, no el siguiente (ver `docs/PENDING.md` §15).

Formato sugerido: `FS-0000001` (prefijo fijo de FitStack + correlativo, sin componente de org).

### Campos del comprobante

| Sección | Campo | Origen |
|---|---|---|
| Emisor | Nombre legal, RIF | Config fija de FitStack (cuando exista) |
| Receptor | `organization.legalName` / `name`, `organization.taxId` | tabla `organization` |
| Identificación | `receiptNumber` (o `invoiceNumber`) | `platform_document_sequence` |
| Detalle | `planSnapshotName`, `planSnapshotPrice`, `planSnapshotCurrency`, `planSnapshotDurationValue/Unit` | `platformSubscriptionPayment` (snapshot, no `platformPlan` en vivo) |
| Periodo cubierto | derivar de `platformSubscription.startDate` + duración snapshot | `platformSubscription` |
| Monto | `amountPaid`, `currencyPaid`, `exchangeRateApplied`, `baseAmount` | `platformSubscriptionPayment` |
| Método de pago | `paymentMethod`, `paymentMethodDetails` (enmascarado si sensible) | `platformSubscriptionPayment` |
| Fechas | `paymentDate` (pago) vs fecha de emisión del comprobante (pueden diferir) | `platformSubscriptionPayment` |
| Pie legal | disclaimer país + "Emitido por FitStack" | config de país del `organization.countryCode` del Org receptor |

### Nota sobre features

`featuresSnapshot` (jsonb) normalmente **no** va impreso en el comprobante — es información de entitlement interno, no de facturación. Solo inclúyelo si el Org lo pide explícitamente como respaldo de qué contrató.

---

## B. Nivel Panel — Member paga al Gym

**Emisor:** la Organización (gym) — cada una es un emisor potencialmente distinto.
**Receptor:** el `gymMember`.
**Tabla fuente:** `payment`.

### Numeración

Una secuencia **por organización**, porque cada gym necesita su propia numeración correlativa e independiente (si algún día factura fiscalmente, esa numeración debe ser exclusiva de su RIF/NIT, no compartida con otros gyms):

```
organization_document_sequence
 ├─ organization_id
 ├─ document_type   -- 'receipt' | 'invoice'
 ├─ year            -- año local del emisor (reinicio anual)
 └─ last_number     -- ÚLTIMO número entregado
 PK (organization_id, document_type, year)
```

La asignación es la misma sentencia atómica `INSERT … ON CONFLICT DO UPDATE … RETURNING` (sin `SELECT … FOR UPDATE`).

Formato sugerido: `{slug-del-gym}-2026-000045` (evita usar el `organization.id` completo, es un texto largo poco legible).

### Campos del comprobante

| Sección | Campo | Origen |
|---|---|---|
| Emisor | `organization.legalName` / `name`, `organization.taxId`, `organization.address`, logo | tabla `organization` |
| Receptor | `gymMember.firstName/lastName`, `gymMember.documentId` (según `docLabel` del país) | tabla `gymMember` |
| Identificación | `receiptNumber` | `organization_document_sequence` (scope: esa `organization_id`) |
| Detalle | `payment.planSnapshotName`, `planSnapshotPrice`, `planSnapshotCurrency` | `payment` (snapshot, no `membershipPlan` en vivo) |
| Periodo cubierto | `subscription.startDate` → `subscription.endDate` | `subscription` |
| Monto | `amountPaid`, `currencyPaid`, `exchangeRateApplied` | `payment` |
| Impuestos | `subtotal`, `taxTotal`, `taxDetails` (según `organization.fiscalConfig.taxes`; nacen apagados salvo `isFormalTaxpayer: true`) | `payment` + config de país/org |
| Método de pago | `paymentMethod`, `paymentMethodDetails` (enmascarado) | `payment` |
| Fechas | `paymentDate` vs fecha de emisión | `payment` |
| Pie legal | disclaimer del país del gym (`organization.countryCode`) + "Generado con FitStack" | config de país |

### Diferencia clave vs. Console

En Panel, los impuestos (`taxDetails`) **sí pueden variar por comprobante**, porque cada gym decide si activa o no impuestos en su `fiscalConfig`. En Console, en cambio, los impuestos (si algún día aplican) los define FitStack de forma uniforme para todos los Orgs de un mismo país — no cada Org decide su propio IVA sobre lo que le cobra FitStack.

---

## Tabla comparativa rápida

| | Console | Panel |
|---|---|---|
| Emisor | FitStack (único) | Cada gym (múltiple) |
| Receptor | Organización | Member |
| Alcance de la numeración | Global, una sola secuencia | Por organización, una secuencia por gym |
| Quién configura impuestos | FitStack (uniforme por país) | Cada gym (`fiscalConfig` propio) |
| Tabla fuente | `platformSubscriptionPayment` | `payment` |
| ¿Puede ser "invoice" hoy? | No (FitStack sin RIF aún) | No (requiere homologación por gym, ver checklist) |

## Checklist antes de generar el primer PDF real

- [ ] `receiptNumber` se asigna en el paso 1, al **validar el pago** (no al crear el registro ni al generar el PDF; el PDF es el paso 2 y no numera)
- [ ] El número nunca se reutiliza aunque el pago se anule después (usar estado `voided`, no borrar ni reciclar el número)
- [ ] El UUID técnico no aparece en ningún lugar visible del PDF
- [ ] El disclaimer legal corresponde al país del **emisor** (FitStack en Console, el gym en Panel), no al país del receptor si difieren
- [ ] Los montos en moneda distinta a la principal siempre muestran la tasa aplicada junto al monto convertido
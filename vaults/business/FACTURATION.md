# Facturación y comprobantes — guía de referencia

> Documento de referencia interna. Última revisión: sept 2026.
> Ver también: `[[RESPONSABILITIES]]`, `[[PAYMENT_STATUSES]]`

## 1. Diferencia entre comprobante y factura fiscal

- **Comprobante de pago:** documento interno que certifica que una transacción ocurrió. No requiere autorización de ninguna autoridad tributaria. Es lo único que FitStack debe emitir hoy, en ambos niveles (Console y Panel).
- **Factura fiscal:** documento con validez tributaria, sujeto a homologación/autorización de la autoridad del país (SENIAT, DIAN, SAT, AFIP, SII, SUNAT...). Requiere numeración oficial y, en varios países, un proveedor tecnológico autorizado de por medio.

**Regla general: mientras no exista homologación fiscal real conectada, todo documento generado por FitStack debe decir "comprobante", nunca "factura".**

## 2. Cuándo una Org puede pasar de `receipt` a `invoice`

Tres condiciones, las tres necesarias:

1. Tiene `taxId` (RIF/NIT/RFC/RUC/CUIT) cargado en su perfil.
2. Fit-Stack declara `fiscalConfig.isFormalTaxpayer: true` desde Console, con la identidad fiscal completa (`legalName` + `taxId` + `address`); el tenant no puede escribirlo (403 `FISCAL_CONFIG_PLATFORM_ONLY`).
3. Tiene un mecanismo de numeración/homologación fiscal real conectado (imprenta digital autorizada en VE, PAC/CFDI en MX, CUFE/DIAN en CO, etc.).

Sin el punto 3, no ofrecer la opción en producto, aunque el gym diga estar registrado.

## 3. Estructura recomendada del comprobante

**Encabezado (identidad de la Org, no de FitStack):**
- `legalName` (fallback a `name`)
- `taxId` (omitir línea si no existe, no inventar)
- `address`, logo si está configurado

**Identificación del documento:**
- Etiqueta resuelta por el **gate de 3 condiciones** (`taxId` + `isFormalTaxpayer: true` + homologación real conectada): "Comprobante de pago" por defecto (nunca "Factura" salvo condición cumplida, ver §2). El campo `documentLabel` es de solo lectura, no participa del gate.
- Número correlativo **por organización**, no el ID global del pago. Tabla de secuencia dedicada:

```
organization_document_sequence
 ├─ organization_id
 ├─ document_type      -- 'receipt' | 'invoice'
 ├─ year               -- año local del emisor (reinicio anual)
 └─ last_number        -- ÚLTIMO número entregado
```

Guardar el número asignado en `payment.receiptNumber`, asignado en el **paso 1 (al validar el pago)**, no al crear el registro ni al generar el PDF (evita huecos si un pago se anula sin emitir comprobante). La asignación es una única sentencia atómica `INSERT … ON CONFLICT DO UPDATE … RETURNING`, sin transacción interactiva ni `SELECT … FOR UPDATE`. El PDF es el **paso 2** (render asíncrono en `jobs-worker`), no asigna número.

**Datos del miembro:** nombre completo, documento de identidad si existe (usar `docLabel` del país), contacto opcional.

**Identificación (persona y organización):** se persiste como un solo string `"<tipo>-<número>"` (p. ej. `V-12345678`, `C.C.-12345678`). Los prefijos válidos salen de `COUNTRIES[cc].docType` y la etiqueta de `docLabel` (persona natural) o `taxLabel` (organización); ningún label se escribe a mano en los formularios. El parseo es tolerante: un valor anterior sin prefijo (o con un prefijo que el país no define) se conserva tal cual y se normaliza recién al volver a guardar.

**El servidor no confía en el selector del cliente (RD-148).** `isDocumentIdAllowedForCountry` (`packages/shared/src/formatting/document-id.ts`) valida el prefijo contra `COUNTRIES` **antes de escribir** y la API responde `400 { error, code: 'DOCUMENT_TYPE_INVALID', fields }` (`documentIdTypeViolation`, `apps/api-worker/src/lib/schemas.ts`) en `POST`/`PUT /api/members` (`documentId`), `POST`/`PUT /api/trainers` (`documentId`), `PATCH /api/organizations/profile` (`taxId` contra el país de la org), `POST`/`PUT`/`PATCH /api/platform/organizations` (`taxId`, leyendo el país y el id persistidos cuando el payload los omite) y `POST /api/platform/settings` (identidad del emisor: `fitstack_tax_id` contra `fitstack_country_code`, con el país persistido si la escritura parcial lo omite). Tolerancias, para no bloquear datos heredados: vacío/ausente → OK; valor **idéntico al persistido** → OK (el guard solo juzga lo que la escritura **cambia**, así una fila legacy sigue editable); sin `-` → OK; token que ningún país define → OK (es indistinguible de un número con guion interno, igual que `parseDocumentId`); país desconocido/ausente → OK (no hay catálogo que exigir y la emisión fiscal ya falla cerrada). Se **rechazan** un prefijo definido por **otro país** (`C.C.`/`NIT` en un emisor VE) y un `"V-"` colgante sin número. Un gym VE no puede registrar un tipo de documento colombiano.

**Detalle de la venta:** nombre del plan (snapshot, no el plan en vivo), periodo cubierto (`startDate`–`endDate`), precio unitario snapshot.

**Desglose monetario:** `subtotal`, `taxDetails` (JSON `[{name, rate, amount}]`), `taxTotal`, `amountPaid`, `currencyPaid`. Si `currencyPaid ≠ planSnapshotCurrency`, mostrar también `exchangeRateApplied` y el equivalente en la moneda del plan (`baseCurrency` del comprobante). La tasa persistida se lee "1 {planSnapshotCurrency} = {rate} {currencyPaid}", por lo que el equivalente se obtiene dividiendo (`roundCents(amountPaid / rate)`).

**Pago:** método y referencia enmascarada (no exponer números de cuenta completos), fecha de pago vs. fecha de emisión del comprobante.

**Pie legal:** disclaimer específico del país (ver `COUNTRIES.legalDisclaimer`) + atribución "Generado con FitStack".

## 4. Tabla de impuestos por país — estado y correcciones

| País | Nombre correcto del impuesto | Tasa | Nota |
|---|---|---|---|
| VE | IVA | 16% | Además existe IGTF (condicional: solo si el pago no es en VES). La tasa vigente vive en `COUNTRIES.conditionalTaxes` (SSOT) y se actualiza ahí cuando cambie el decreto — nunca por organización |
| CO | IVA | 19% | — |
| MX | IVA | 16% | Zona fronteriza tiene tasa reducida (8%), no cubierto por el default nacional |
| AR | IVA | 21% | — |
| CL | IVA | 19% | — |
| PE | **IGV** (no "IVA") | 18% | Corregir nombre en `countryTaxes`. Tasa compuesta (IGV + Impuesto de Promoción Municipal), total se mantiene en 18% durante recomposición gradual 2026–2029 |
| ES | IVA | 21% | — |
| US | — | — | **No existe VAT/IVA nacional en EE.UU.** Dejar `countryTaxes: []` y usar disclaimer indicando que el sales tax depende del estado |
| PA | ITBMS | 7% | — |

## 5. Campos genéricos vs. específicos por país (schema)

**Genérico para todos los países** (`ICountryConfig` ya cubre esto bien):
- `docLabel`, `taxLabel`, `docType`, `currency`, `timezone`, `legalDisclaimer`

**Por país, en `organization.fiscalConfig`** (el resto —tasas y condiciones— lo define `COUNTRIES`, no la org):
```json
{
  "documentLabel": "Comprobante de pago",
  "isFormalTaxpayer": false,
  "disclaimerOverride": null
}
```
`isFormalTaxpayer` es **platform-only** (se escribe solo desde Console, con identidad fiscal completa); el tenant únicamente edita `disclaimerOverride`. No existen `taxes` ni `confirmedTaxes`: cualquier clave fuera de este contrato responde 400.

**Condicionales especiales (no van en `countryTaxes` fijo):**
```ts
conditionalTaxes: [
  { name: "IGTF", type: "conditional", condition: "payment_currency !== 'VES'", value: "3%" }
]
```

> El IGTF es un impuesto **condicional del país**: se aplica solo cuando `isFormalTaxpayer` es verdadero **y** la condición se cumple (`payment_currency !== 'VES'`), con `basis: 'gross_first'` asignado por `resolveFiscalProfile` (extrae el IGTF del total **antes** de descomponer el resto con IVA). No hay confirmación manual ni tasa por org. Ver RD-138 y RD-145 (Linear — proyecto «Fit Stack»).

## 6. Notas específicas de Venezuela

- IVA general 16%, pero el Ejecutivo puede moverlo entre 8% y 16.5% por decreto — mantenerlo configurable, no constante de código.
- IGTF aplica a pagos en divisas o criptomonedas distintas al bolívar (incluye "Transferencia Binance"). Tasa variable por decreto, verificar con contador antes de aplicar cualquier número.
- El IGTF se expresa en bolívares en el comprobante → obligatorio registrar `exchangeRateApplied` en cualquier pago que no sea en VES.
- SENIAT exige facturación digital obligatoria (desde marzo 2025) para contribuyentes que operan 100% por medios electrónicos — aplica a FitStack en el nivel Console **una vez tenga RIF**, no aplica a FitStack por las ventas de los gyms a sus miembros.

## 7. Checklist antes de habilitar facturación fiscal real (cualquier país)

- [ ] Entidad legal constituida con tax ID propio (para FitStack) o del gym (para nivel Panel)
- [ ] Proveedor homologado de facturación electrónica integrado
- [ ] Numeración fiscal oficial conectada (no generada internamente)
- [ ] Disclaimer legal actualizado para reflejar que ahora sí es una factura fiscal
- [ ] Confirmación explícita del gym/organización de que asume esa responsabilidad
# Facturación y comprobantes — guía de referencia

> Documento de referencia interna. Última revisión: sept 2026.
> Ver también: `responsabilidades-fitstack-org.md`

## 1. Diferencia entre comprobante y factura fiscal

- **Comprobante de pago:** documento interno que certifica que una transacción ocurrió. No requiere autorización de ninguna autoridad tributaria. Es lo único que FitStack debe emitir hoy, en ambos niveles (Console y Panel).
- **Factura fiscal:** documento con validez tributaria, sujeto a homologación/autorización de la autoridad del país (SENIAT, DIAN, SAT, AFIP, SII, SUNAT...). Requiere numeración oficial y, en varios países, un proveedor tecnológico autorizado de por medio.

**Regla general: mientras no exista homologación fiscal real conectada, todo documento generado por FitStack debe decir "comprobante", nunca "factura".**

## 2. Cuándo una Org puede pasar de `receipt` a `invoice`

Tres condiciones, las tres necesarias:

1. Tiene `taxId` (RIF/NIT/RFC/RUC/CUIT) cargado en su perfil.
2. Declara explícitamente `fiscalConfig.isFormalTaxpayer: true` bajo su propia responsabilidad.
3. Tiene un mecanismo de numeración/homologación fiscal real conectado (imprenta digital autorizada en VE, PAC/CFDI en MX, CUFE/DIAN en CO, etc.).

Sin el punto 3, no ofrecer la opción en producto, aunque el gym diga estar registrado.

## 3. Estructura recomendada del comprobante

**Encabezado (identidad de la Org, no de FitStack):**
- `legalName` (fallback a `name`)
- `taxId` (omitir línea si no existe, no inventar)
- `address`, logo si está configurado

**Identificación del documento:**
- Etiqueta configurable: "Comprobante de pago" por defecto (nunca "Factura" salvo condición cumplida, ver §2)
- Número correlativo **por organización**, no el ID global del pago. Usar tabla de secuencia dedicada:

```
organization_document_sequence
 ├─ organization_id
 ├─ document_type      -- 'receipt' | 'invoice'
 └─ next_number         -- incrementado transaccionalmente
```

Guardar el número asignado en `payment.receiptNumber`, asignado al **generar el PDF**, no al crear el pago (evita huecos si un pago se invalida antes de emitir comprobante).

**Datos del miembro:** nombre completo, documento de identidad si existe (usar `docLabel` del país), contacto opcional.

**Detalle de la venta:** nombre del plan (snapshot, no el plan en vivo), periodo cubierto (`startDate`–`endDate`), precio unitario snapshot.

**Desglose monetario:** `subtotal`, `taxDetails` (JSON `[{name, rate, amount}]`), `taxTotal`, `amountPaid`, `currencyPaid`. Si `currencyPaid ≠ primaryCurrency` de la Org, mostrar también `exchangeRateApplied` y el equivalente convertido.

**Pago:** método y referencia enmascarada (no exponer números de cuenta completos), fecha de pago vs. fecha de emisión del comprobante.

**Pie legal:** disclaimer específico del país (ver `COUNTRIES.legalDisclaimer`) + atribución "Generado con FitStack".

## 4. Tabla de impuestos por país — estado y correcciones

| País | Nombre correcto del impuesto | Tasa | Nota |
|---|---|---|---|
| VE | IVA | 16% | Además existe IGTF (condicional, solo si el pago es en USD/cripto; tasa variable por decreto — no hardcodear, requiere confirmación manual/contador) |
| CO | IVA | 19% | — |
| MX | IVA | 16% | Zona fronteriza tiene tasa reducida (8%), no cubierto por el default nacional |
| AR | IVA | 21% | — |
| CL | IVA | 19% | — |
| PE | **IGV** (no "IVA") | 18% | Corregir nombre en `countryTaxes`. Tasa compuesta (IGV + Impuesto de Promoción Municipal), total se mantiene en 18% durante recomposición gradual 2026–2029 |
| ES | IVA | 21% | — |
| US | — | — | **No existe VAT/IVA nacional en EE.UU.** Eliminar el valor "20%" (parece copiado del Reino Unido). Dejar `countryTaxes: []` y usar disclaimer indicando que el sales tax depende del estado |

## 5. Campos genéricos vs. específicos por país (schema)

**Genérico para todos los países** (`ICountryConfig` ya cubre esto bien):
- `docLabel`, `taxLabel`, `docType`, `currency`, `timezone`, `legalDisclaimer`

**Por país, en `organization.fiscalConfig` (override sobre el default del país):**
```json
{
  "documentLabel": "Comprobante de pago",
  "isFormalTaxpayer": false,
  "taxes": [{ "name": "IVA", "rate": 0.16, "enabled": false }],
  "disclaimerOverride": null
}
```

**Condicionales especiales (no van en `countryTaxes` fijo):**
```ts
conditionalTaxes: [
  { name: "IGTF", type: "conditional", condition: "payment_currency !== primary_currency", value: null }
]
```

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
# Backlog — Fiscal / Facturación

> Temas de facturación formal, impuestos y disclaimer legal del emisor.
> Volver al [[backlog/README|índice del backlog]].

## 1. `gym_member.fiscal_address` opcional

- [ ] **Añadir `fiscal_address` opcional al miembro.**
  - Hoy el comprobante **omite la línea** de dirección del receptor cuando no hay dato (nunca la rellena con placeholders). Agregar el campo permite imprimirla cuando exista.
  - Es el único pendiente que quedó de la preparación de base de datos de localización (el resto —`countryCode`, `taxId`, `legalName`, `address`, `fiscalConfig`, `timezone`, `primaryCurrency`, `currencyFormat`— ya está implementado).

## 2. Integraciones de facturación (PAC/PAD) e impuestos dinámicos

- [ ] **Filtro de adaptadores**: crear una interfaz genérica de adaptadores para integrarse con PAC/PAD, Proveedores Tecnológicos u otros sistemas fiscales locales según el `country_code` de la organización.
- [ ] **Gestión de impuestos dinámicos**: implementar la lógica que calcule impuestos locales dinámicamente (ej. IGTF 3 %, IVA 16 %) según el `country_code` y el tipo de pago.
  - **Disparador**: cuando se decida ofrecer facturación fiscal formal.

## 3. Comprobantes Console — disclaimer con país proxy

- [ ] **El disclaimer de Console usa el país del org receptor como proxy hasta configurar `fitstack_country_code`.**
  - El disclaimer legal de los comprobantes de Console debería corresponder al país del **emisor** (FitStack), pero FitStack aún no tiene país propio: se usa el `countryCode` del org receptor como aproximación temporal (ver `[[plan]]`, decisión congelada).
  - Al definir `fitstack_country_code`, cambiar el disclaimer a ese país y tachar este ítem. **No dejar que el proxy sobreviva silenciosamente hasta producción.**

## 4. Comprobantes — gating fiscal (C2): tasa del IGTF y emisor plataforma

> Base C2 (código) implementada en [[FS-0001]]: `FiscalConfigSchema`, impuestos nacidos apagados, `gross_first`, `TAXES_REQUIRE_FORMAL_TAXPAYER` / `TAX_REQUIRES_CONFIRMATION`, UI de declaración en el Panel. Abajo solo queda la acción humana.

- [ ] **Confirmar tasa y base del IGTF con un contador antes de encenderlo en un gym real.**
  - El IGTF nace **apagado** y **nunca automático**: activarlo exige declarar el negocio como contribuyente formal + marcar la confirmación de tasa + indicar la tasa a mano (`fiscalConfig.confirmedTaxes`). El `3%` de `COUNTRIES.VE.conditionalTaxes` es **referencia documentada**, no valor efectivo: la tasa varía por decreto ([[FACTURATION]] §6).
  - Base implementada: `basis: 'gross_first'` — el IGTF se **extrae primero** del monto cobrado y el resto se descompone tax-inclusive con el IVA (cambia la base del IVA; el UI lo advierte). Verificar con el contador que la base legal es el monto pagado en divisa.
  - Ejemplo verificado en tests: cobrado 30,90 con IVA 16 % + IGTF 3 % → IGTF 0,93 · base 25,84 + IVA 4,13 · suma exacta 30,90.
- [ ] **Declarar a FitStack (emisor plataforma) como contribuyente formal si se quiere desglose en los comprobantes `FS-N`.**
  - Hoy no existe storage ni UI de `fiscalConfig` para el emisor plataforma, así que los comprobantes SaaS persisten `subtotal = amountPaid / taxTotal = 0 / taxDetails = []` (solo el total cobrado) y lo dicen en Console → Settings → Emisor. Es la postura conservadora correcta (nadie declaró ese IVA).
  - Para habilitarlo: `platform_setting` con el `fiscalConfig` de FitStack + toggles en `emitter-settings.tsx` (mismo patrón del Panel: declaración, tasa manual, confirmación) y cablearlo en el paso 1 SaaS y en el twin de `receipt-compose` (`platform-receipts.service.ts` + `jobs-worker`).
  - **Disparador**: decisión de producto de facturar con impuestos en el lado plataforma.

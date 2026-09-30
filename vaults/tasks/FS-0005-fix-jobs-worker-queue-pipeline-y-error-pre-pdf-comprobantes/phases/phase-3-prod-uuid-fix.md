# Fase 3 — Diagnóstico y corrección de UUID visible (Prod)

> Estado: ⏳ Pendiente

## Objetivo
Resolver la falla:
`receipt.render: checklist pre-PDF falló para pago 4: UUID técnico visible en campos del comprobante.`

## Diagnóstico
El validador `checklistPrePdf` en `packages/shared/src/documents/receipt-data.ts` evalúa:
```ts
const visibleStrings: string[] = [
  data.document.number,
  data.document.label,
  data.emitter.name,
  data.emitter.legalName ?? '',
  data.emitter.taxId ?? '',
  data.emitter.address ?? '',
  data.recipient.name,
  data.recipient.documentId ?? '',
  data.sale.planName,
  data.method.name,
  ...(data.method.maskedDetails ?? []).map((d) => `${d.label} ${d.value}`),
];
if (visibleStrings.some((s) => UUID_PATTERN.test(s))) {
  errors.push('UUID técnico visible en campos del comprobante.');
}
```

Para el pago `4`:
1. Uno de los campos anteriores contiene un string que hace match con `UUID_PATTERN` (`/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`).
2. Lo más probable es `payment.paymentMethod` (o un detalle dentro de `maskedDetails` o `planName`), donde en lugar de guardarse una etiqueta legible como `"Transferencia bancaria"` o `"Efectivo"`, se guardó directamente el ID de base de datos o configuración (`uuid`).

## Tareas pendientes
1. **Inspección de BD**: Ejecutar en base de datos de producción:
   ```sql
   SELECT id, payment_method, payment_method_details, plan_snapshot_name FROM payment WHERE id = 4;
   ```
2. **Corrección en origen**:
   - Asegurar que el endpoint/formulario que registra el pago resuelva el nombre legible del método de pago antes de persistir `payment.paymentMethod`.
   - Si `paymentMethodDetails` contiene metadatos con UUIDs, asegurar que `maskPaymentDetails` los filtre o enmascare para que no se expongan en el comprobante visible.
3. **Data patch**:
   - Actualizar el registro del pago `4` en la BD para reemplazar el valor UUID por el texto legible adecuado.
   - Re-encolar el evento o permitir que el barrido (`sweepPendingReceiptPdfs`) procese el comprobante sin fallar el checklist.

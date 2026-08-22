# ¿Cómo funcionan las membresías, renovaciones y pagos?

## Planes de membresía

Son el catálogo de productos de **tu** gimnasio. Tú defines cada uno desde el panel:

- Duración flexible: diaria, semanal, mensual o anual.
- Precio y moneda de cobro.
- Beneficios y descripción para mostrar a tus clientes.

## Suscripciones y la regla de vencimiento acumulativo

Una suscripción vincula un miembro con un plan. La regla más importante:

> **Si un cliente renueva antes de vencer, los nuevos días se suman desde su fecha de vencimiento actual — no desde hoy. Así ningún día pagado se pierde.**

Ejemplo con plan mensual:
- El plan de Ana vence el 30 de agosto.
- Renueva el 25 de agosto (5 días antes).
- Su nueva fecha de vencimiento es el **30 de septiembre**: los 5 días que le sobraban se conservan.

## Pagos

Cada pago queda registrado en tu historial financiero con detalle auditable:

- Monto, moneda y **tasa de cambio exacta del día** si cobraste en moneda local.
- Método de pago, referencia bancaria y comprobante (hash, número de operación, captura de pantalla).
- Estados: pendiente (factura emitida), en proceso (pago recibido, esperando validación), validado (confirmado), inválido (rechazado), anulado.

El sistema evita registrar dos veces el mismo pago mientras está en proceso.

## Registro atómico

Suscripción y pago se registran juntos en una sola operación. Esto garantiza que el acceso del cliente (tiempo) y tus finanzas nunca queden desincronizados: no existen pagos sin suscripción ni accesos sin respaldo financiero.

## Recibos automáticos

Tras cada pago validado:

1. Se genera un recibo en PDF.
2. Se envía automáticamente por email al cliente.
3. Puedes reenviarlo cuando quieras desde el historial de pagos.

## Estados de una suscripción

| Estado | Significado |
|---|---|
| **Activa** | El cliente tiene acceso garantizado |
| **Por vencer** | Le quedan pocos días — momento ideal para renovar (¡los días se acumulan!) |
| **Vencida** | Sin acceso hasta renovar; su historial y datos se conservan |
| **Cancelada** | Dada de baja manualmente |

Temas relacionados: [Monedas y tipos de cambio](HOW-WORKS-MULTI-CURRENCY.md) · [Roles y permisos](HOW-WORKS-ROLES-PERMISSIONS.md)

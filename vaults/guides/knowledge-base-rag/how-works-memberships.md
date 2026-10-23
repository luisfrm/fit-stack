# ¿Cómo funcionan las membresías, renovaciones y pagos?

Este es el flujo comercial central de tu gimnasio: cómo vendes planes, cómo se activa el acceso de tus clientes y cómo queda registrado cada cobro.

## Planes: tu catálogo

Son los productos que vendes. Los creas en Panel → Planes:

- **Duración flexible**: diaria, semanal, mensual o anual. El sistema calcula el vencimiento sumando esa duración.
- **Precio y moneda**: defines el monto y en qué moneda se cobra, entre las monedas que tengas activas.
- **Descripción y beneficios**: el texto que ves en el mostrador y que aparece en tu sitio público si usas la página web.

Un mismo cliente puede comprar el mismo plan muchas veces; cada compra genera una membresía nueva.

## Membresías y vencimiento acumulativo

Una membresía une a un cliente con un plan y fija hasta cuándo tiene acceso. La regla más importante es el **vencimiento acumulativo**:

> Si el cliente renueva antes de vencer, los días nuevos se suman a partir de su fecha de vencimiento actual, no desde hoy. Ningún día pagado se pierde.

Ejemplo con un plan de 30 días:

- La membresía vence el 30 de agosto.
- El cliente renueva el 25 de agosto, cuando le quedan 5 días.
- Su nuevo vencimiento es el 30 de septiembre: los 5 días restantes se conservan.
- Si renovara después de vencida, el periodo nuevo empieza en la fecha de pago.

Cuando registras una membresía, el sistema propone el inicio y el fin del periodo. Si lo acortas a mano, te pedirá el motivo.

## Pagos: registro auditable

Cada cobro queda en tu historial con el detalle que necesita tu contabilidad:

- **Montos**: lo cobrado, la moneda de cobro, la tasa exacta del día si cobraste en moneda local y su equivalente en tu moneda principal para los reportes.
- **Comprobante**: método de pago (efectivo, transferencia, tarjeta, otro), referencia bancaria o número de operación, y captura de pantalla si la adjuntas.
- **Estados**: por validar (recibiste el pago y espera confirmación), validado (confirmado) y anulado (rechazado o cancelado; rechazar y anular son el mismo estado, el pago no cuenta). Mientras un pago está por validar no puedes registrar otro en la misma membresía, para no duplicar ingresos.
- **Fecha de pago**: la eliges al registrar y el sistema la guarda en tu zona horaria.

## Membresía y pago van juntos

Al cobrar, el sistema crea la membresía y su pago en la misma operación. Si algo falla a mitad de camino, deja constancia y avisa con un error: no queda un acceso sin respaldo financiero.

## Comprobante automático por correo

Cuando un pago queda validado, el sistema:

1. Genera un comprobante en PDF con los datos del cliente, el plan, los montos, la moneda, la tasa y la referencia.
2. Lo envía por correo a la dirección de la ficha del cliente.
3. Te deja reenviarlo cuando quieras desde el historial de pagos.

El envío ocurre en segundo plano: no frena el cobro en recepción.

## Estados de una membresía

| Estado | Significado | Qué debe hacer el cliente |
|---|---|---|
| **Activa** | Tiene acceso hasta su fecha de vencimiento | Nada |
| **Por vencer** | Le quedan pocos días | Es el momento ideal para renovar: los días se acumulan |
| **Vencida** | Pasó la fecha sin renovar | Sin acceso hasta renovar; su historial se conserva |
| **Cancelada** | Se revocó el acceso desde el panel (el cobro sigue siendo válido) | Sin acceso; se reactiva con una membresía nueva |
| **Anulada** | El cobro se anuló o se rechazó: el registro no vale | Se corrige registrando un cobro nuevo |

Si preguntan cómo se guarda la tasa de cambio de un pago en moneda local, eso está en cómo funcionan las monedas. Si preguntan quién del equipo puede cobrar, eso está en roles y permisos.

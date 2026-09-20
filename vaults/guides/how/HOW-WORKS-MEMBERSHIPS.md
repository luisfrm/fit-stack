# ¿Cómo funcionan las membresías, renovaciones y pagos?

Este documento explica el flujo comercial central de tu gimnasio en FitStack: cómo vendes planes, cómo se activa el acceso de tus clientes y cómo queda registrado cada cobro.

## Planes de membresía: tu catálogo

Son los productos que vendes. Tú los defines desde Panel, Configuración, Planes de Membresía:

- **Duración flexible**: diaria, semanal, mensual o anual. El sistema calcula el vencimiento sumando esa duración a la fecha de inicio o de vencimiento vigente.
- **Precio y moneda**: defines el monto y en qué moneda se cobra. Puede ser tu moneda base (USD) o cualquiera de las monedas locales que tengas activas.
- **Descripción y beneficios**: texto para mostrar a tus clientes en el mostrador o en el sitio público si usas CMS.

Un mismo cliente puede comprar el mismo plan varias veces a lo largo del tiempo; cada compra genera una suscripción nueva.

## Suscripciones y la regla de vencimiento acumulativo

Una suscripción vincula un miembro con un plan y determina hasta cuándo tiene acceso.

La regla más importante de FitStack es el **vencimiento acumulativo**:

> Si un cliente renueva antes de vencer, los nuevos días se suman desde su fecha de vencimiento actual, no desde hoy. Así ningún día pagado se pierde.

Ejemplo con plan mensual de 30 días:
- El plan de un cliente vence el 30 de agosto.
- Renueva el 25 de agosto, cuando aún le quedan 5 días.
- Su nueva fecha de vencimiento es el 30 de septiembre: los 5 días restantes se conservan y se suman al nuevo mes.
- Si renovara después de vencida, el nuevo período arranca desde la fecha de pago.

Esta lógica aplica tanto para renovaciones anticipadas como para cambios de plan con prorrateo.

## Pagos: registro financiero auditable

Cada pago queda registrado en tu historial con detalle auditable para contabilidad:

- **Montos**: monto cobrado, moneda de cobro, tasa de cambio exacta del día si cobraste en moneda local, y su equivalente en moneda base para reportes.
- **Comprobante**: método de pago (efectivo, transferencia, tarjeta, otro), referencia bancaria, hash o número de operación, y captura de pantalla si la adjuntas.
- **Estados del pago**: en proceso cuando recibes el pago y espera validación, validado cuando lo confirmas y anulado cuando lo rechazas o lo cancelas (rechazar y anular son el mismo estado: el pago no cuenta). El sistema evita registrar dos veces el mismo pago mientras está en proceso para no duplicar ingresos.
- **Fecha de pago**: queda con la fecha que seleccionas en el formulario; el backend la normaliza a tu zona horaria configurada.

## Registro atómico de suscripción y pago

Suscripción y pago se registran juntos en una misma operación: primero la suscripción y después el pago, en el mismo flujo. Esto garantiza que no existan accesos sin respaldo financiero en el caso normal. (Nota interna: los dos inserts todavía no están envueltos en una transacción única; el endurecimiento está registrado en `[[PENDING]]` §12.)

## Recibos automáticos por email

Tras cada pago validado el sistema dispara de forma asíncrona:

1. Genera un recibo en PDF con los datos del miembro, plan, montos, moneda, tasa y referencia.
2. Lo envía automáticamente por email al cliente a la dirección de su ficha.
3. Puedes reenviarlo cuando quieras desde el historial de pagos, incluso si el cliente perdió el correo original.

El envío es vía cola en segundo plano, no bloquea el cobro en recepción.

## Estados de una suscripción

| Estado | Significado | Qué debe hacer el cliente |
|---|---|---|
| **Activa** | Tiene acceso garantizado hasta su fecha de vencimiento | Nada, disfruta su plan |
| **Por vencer** | Le quedan pocos días | Momento ideal para renovar; si renueva ahora los días se acumulan |
| **Vencida** | Pasó su fecha de vencimiento sin renovar | Sin acceso hasta renovar; su historial y datos se conservan intactos |
| **Cancelada** | Se revocó el acceso manualmente desde el panel (el cobro sigue siendo válido) | Sin acceso; se puede reactivar creando una nueva suscripción |
| **Anulada** | El cobro se anuló o se rechazó: el registro es inválido | El registro no vale; se corrige anulando o registrando un cobro nuevo |

Si preguntan cómo se calcula o se guarda la tasa de cambio de un pago en moneda local, ese detalle está en cómo funcionan las monedas y tipos de cambio. Si preguntan quién dentro del equipo puede registrar cobros, eso está en roles y permisos del personal.

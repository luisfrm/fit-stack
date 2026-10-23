# ¿Cómo funcionan las monedas y tipos de cambio?

FitStack está pensado para Latinoamérica, donde cobrar en dólares no siempre es práctico. Por eso distingue entre tu moneda principal y las monedas con las que cobras, y guarda la tasa exacta de cada operación.

## Moneda principal y monedas de cobro

- **Moneda principal**: la referencia con la que piensas y reportas tu negocio. Se define con el país de tu gimnasio al crear la cuenta y puedes cambiarla por otra de tus monedas activas desde Configuración. Todos los reportes se consolidan en ella.
- **Monedas de cobro**: en las que realmente cobras en recepción (bolívares, pesos colombianos, pesos mexicanos, soles, euros, dólares en efectivo…). Tú decides cuáles están activas.

Puedes tener varias monedas activas a la vez: un cliente paga hoy en bolívares y mañana en dólares sin fricción.

## Tipos de cambio del día

- Al registrar un pago en moneda local, el panel consulta la tasa del momento en una fuente pública. La tasa se muestra en **solo lectura**: nadie la escribe a mano.
- Si la fuente no responde, el sistema usa la última tasa conocida de esa moneda y lo indica; si no hay ninguna, bloquea el cobro. Nunca se inventa una tasa.
- **Cada pago guarda la tasa que se aplicó ese día.** Si el dólar sube mañana, tus pagos históricos conservan su tasa original.
- El equivalente en la moneda del plan se guarda junto al pago, así los reportes no tienen que recalcular con tasas que ya cambiaron.
- El formato de números y fechas se adapta a tu país: separadores, símbolo de moneda y presentación.

## Reportes multi-moneda

Los reportes llevan cada cobro a tu moneda principal con el equivalente que se guardó en cada pago. Aunque hoy cobres en bolívares y mañana en pesos, ves el total real de tu negocio en una cifra comparable mes a mes.

Ejemplo: cobraste 3.000 en bolívares a una tasa de 36,50 y 50.000 en pesos a una tasa de 4.100; el reporte convierte cada cobro con su propia tasa y muestra el consolidado.

### Cobros que no se pueden convertir

Si el plan se vendió en una moneda distinta a tu moneda principal y no hay una tasa que permita llevarlo a ella, ese cobro **no se suma** al total. El reporte lo informa aparte, como monto no convertido, y marca el total como parcial. Nunca se presenta una suma incompleta como si fuera el total real ni se asume una tasa inventada.

## Configuración por gimnasio

Cada gimnasio configura lo suyo en Panel → Configuración:

1. **Monedas activas**: las que aceptas en recepción. Las inactivas no aparecen al cobrar.
2. **Moneda principal y país**: tu referencia contable y el formato local por defecto.
3. **Métodos de pago**: efectivo, transferencia, tarjeta, pago móvil u otros, con sus datos (banco, cuenta, titular, instrucciones) y qué le pide el formulario al cajero.

Si preguntan cómo se registra un pago o cómo funciona el vencimiento acumulativo, eso está en cómo funcionan las membresías.

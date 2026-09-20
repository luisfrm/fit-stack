# ¿Cómo funcionan las monedas y tipos de cambio?

FitStack está diseñado para Latinoamérica, donde cobrar en dólares no siempre es práctico. Por eso distingue entre moneda base y moneda de cobro, y guarda la tasa exacta de cada operación para auditoría.

## Moneda base vs moneda de cobro

- **Moneda base**: la referencia para pensar y reportar tu negocio. Por defecto es USD, pero puedes cambiarla por gimnasio desde Configuración. Todos los reportes consolidan en esta moneda.
- **Moneda de cobro o moneda local**: en lo que realmente cobras a tus clientes en recepción: bolívares venezolanos, pesos colombianos, pesos mexicanos, pesos argentinos, pesos chilenos, soles peruanos, euros o dólares en efectivo. Tú decides cuáles están activas para cobrar.

Puedes tener varias monedas activas a la vez y un cliente puede pagar hoy en bolívares y mañana en dólares sin fricción.

## Tipos de cambio en tiempo real

- Al registrar un pago en moneda local, el panel consulta en ese instante la tasa de cambio desde una fuente pública confiable. Ves la tasa sugerida antes de confirmar.
- **Cada pago guarda la tasa exacta aplicada ese día** en su registro. Si el dólar sube mañana, tus pagos históricos conservan su tasa original; la auditoría queda limpia y comparable.
- El equivalente en moneda base se calcula y guarda junto al pago para que los reportes no tengan que recalcular con tasas volátiles.
- El formato de números y fechas se adapta por país: separadores, símbolo de moneda y presentación según Venezuela, Colombia, México, Argentina, Chile, Perú, España o Estados Unidos.

## Reportes multi-moneda normalizados

Los reportes de ingresos normalizan todos los cobros a tu moneda base usando la tasa guardada de cada pago. Aunque hoy cobres en bolívares y mañana en pesos, ves el total real de tu negocio en una sola cifra comparable mes a mes, sin distorsión por devaluación.

Ejemplo: cobraste 3.000 VES con tasa 36,50 y 50.000 COP con tasa 4.100; el reporte los convierte a USD con esas tasas históricas y te muestra el consolidado en USD.

## Configuración por gimnasio

Cada gimnasio configura de forma independiente desde Panel, Configuración:

1. **Monedas activas para cobrar**: marcas qué monedas aceptas en recepción. Las inactivas no aparecen al cobrar.
2. **Moneda base y país**: define tu referencia contable y el formato local por defecto.
3. **Métodos de pago disponibles**: efectivo, transferencia, tarjeta, pago móvil u otros, con sus detalles (banco, tipo de cuenta, titular, instrucciones) y qué datos pedirá el formulario al cajero.

Si preguntan cómo se registra un pago o cómo funciona el vencimiento acumulativo de una suscripción, ese flujo completo está en cómo funcionan las membresías, renovaciones y pagos.

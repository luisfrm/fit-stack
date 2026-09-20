# ¿Cómo funcionan los créditos IA?

El chat IA del panel consume créditos. Es simple: 1 crédito equivale a 1.000 tokens procesados, contando todo lo que envías y lo que el asistente responde. El consumo se liquida al final de cada respuesta con el uso real reportado por el proveedor.

## Tu límite mensual

- El límite de créditos por mes lo define tu plan de FitStack: Básico 1.500, Standard 4.000, Premium 8.000 al mes, y el piso gratuito opcional con 500.
- **El ciclo se renueva con tu ciclo de facturación**. Si te suscribiste un día 15, tus créditos se reinician cada día 15. No es calendario fijo.
- Si no tienes una suscripción activa a FitStack, el reinicio es el día 1 de cada mes calendario.
- Un límite configurado en 0 significa ilimitado: puedes chatear sin tope.
- El panel estima créditos antes de enviar para no pasarte y liquida el consumo real al terminar el stream. Verás los headers X-Ai-Credits-Used, Limit y Remaining en cada respuesta.

## ¿Qué pasa cuando se agotan?

1. El chat muestra el aviso Sin créditos y no puedes enviar más mensajes hasta el próximo ciclo.
2. El banner superior del panel siempre muestra cuántos llevas usados y cuántos te quedan del ciclo vigente. Cambia a ámbar cuando estás cerca del límite.
3. Al renovarse el ciclo vuelves a tener tu límite completo. Los créditos no usados no se acumulan ni se transfieren al mes siguiente.

## Créditos adicionales

El equipo FitStack puede otorgar créditos extra a tu organización cuando los necesites, sin cambiar tu plan. Se suman directamente al consumo del ciclo vigente como un ajuste puntual y se reflejan al instante en tu banner. Solicítalos a soporte desde el panel.

## Consejos para que rindan el mes

- Haz preguntas concisas y específicas; las respuestas largas consumen más tokens de salida.
- Evita pedirle al asistente que regenere la misma respuesta extensa varias veces seguidas.
- Recuerda que cada respuesta liquida el consumo real con el uso reportado por el modelo, no con la estimación inicial. Nunca pagas créditos de más.
- Reutiliza conversaciones: el historial de 6 mensajes enviado al modelo es más eficiente que repetir contexto en cada pregunta.

## Datos útiles

| Concepto | Valor |
|---|---|
| 1 crédito | 1.000 tokens de entrada más salida, con multiplicador 1.0 para todos los modelos actuales |
| Renovación | Con tu ciclo de facturación si tienes suscripción activa; día 1 del mes si no |
| Acumulación entre meses | No, no se transfieren |
| Créditos extra | Sí, mediante el equipo FitStack como ajuste del ciclo |
| Límite diario de seguridad | 20 por ciento del límite mensual como tope diario para evitar picos |

Si preguntan por el precio en dólares de cada plan o qué otras funciones trae, esa referencia está en cómo funcionan los planes y precios de FitStack.

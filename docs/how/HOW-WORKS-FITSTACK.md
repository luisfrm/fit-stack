# ¿Qué es FitStack?

FitStack es la plataforma SaaS para la gestión integral de gimnasios y estudios de fitness en Latinoamérica. Centraliza en un solo lugar la facturación multi-moneda, la administración de miembros y pagos, la programación de clases, la gestión de personal y el control de acceso físico.

## Problema que resuelve

Muchos gimnasios gestionan cobros en moneda local con tipos de cambio volátiles, pierden miembros por falta de seguimiento y controlan el acceso de forma manual. FitStack unifica esos tres frentes:

- **Facturación multi-moneda con auditoría**: cobra en bolívares, pesos o tu moneda local y consolida reportes en una moneda base (USD por defecto) con la tasa exacta del día de cada pago.
- **Retención y operación diaria**: historial completo de cada miembro, suscripciones con vencimiento acumulativo, pagos con recibo automático y clases con aforo.
- **Control de acceso**: app de recepción para validar ingreso por QR o biometría contra la suscripción activa. Está en desarrollo y todavía no disponible para uso operativo.

## Tu gimnasio, tus datos: aislamiento total

Cada gimnasio es una **organización independiente** dentro de FitStack. Es el pilar de seguridad del sistema:

- Tus miembros, pagos, suscripciones, clases, entrenadores, contenido web y configuración están **aislados por organización**. Ningún otro gimnasio puede verlos.
- El asistente IA, los reportes y las búsquedas solo operan sobre los datos de tu organización.
- Cambiar de organización (si administras varias sedes) requiere volver a autenticar el contexto; no hay fuga de datos entre sedes.

## Las aplicaciones de FitStack

| Aplicación | Para qué sirve | Quién la usa |
|---|---|---|
| **Panel administrativo** | Gestión diaria: miembros, planes, suscripciones, pagos, clases, entrenadores, personal, contenido web, reportes, configuración y chat IA | Dueño, Gerente y Cajero de tu gimnasio |
| **Portal de Miembros** | Tus clientes consultan su plan vigente, sus clases y su progreso | Clientes con acceso habilitado (consume cupo) |
| **Consola FitStack** | Administración de la plataforma: organizaciones, planes SaaS, suscripciones, créditos IA y Base de Conocimiento | Solo equipo FitStack |
| **App de Acceso** | Validación en recepción por QR o biometría contra suscripción activa | Recepción — en desarrollo, aún no disponible |

## Módulos del panel administrativo

- **Miembros**: ficha central de cada cliente con datos, historial de suscripciones y pagos, foto y estado. Base para todo lo demás.
- **Planes de Membresía**: tu catálogo comercial. Tú defines nombre, duración (diaria, semanal, mensual o anual), precio, moneda y descripción.
- **Suscripciones**: vincula un miembro con un plan. Aplica vencimiento acumulativo: renovar antes de vencer suma los días restantes a la nueva fecha, no se pierde ni un día pagado.
- **Pagos**: cada cobro queda con monto, moneda, tasa del día, método, referencia y estado (pendiente, en proceso, validado, inválido, anulado). Suscripción y pago se registran juntos de forma atómica.
- **Clases**: horarios grupales como CrossFit o Yoga con capacidad y control de cupo.
- **Entrenadores y Personal**: separa operación del negocio (Dueño, Gerente, Cajero) de quien imparte clases (Entrenador). Los entrenadores pueden tener perfil público con especialidades y biografía.
- **Contenido Web**: editor drag-and-drop de páginas (inicio, servicios, galería, contacto, equipo) que se publican en el sitio público de tu gimnasio.
- **Reportes**: ingresos normalizados a tu moneda base aunque cobres en varias monedas locales.
- **Configuración**: por gimnasio defines monedas activas, métodos de pago, país e idioma, zona horaria y tema visual.
- **Asistente IA**: responde al instante sobre cómo usar FitStack y sobre los datos de tu propio gimnasio cuando están disponibles en contexto.

## Países soportados

Venezuela, Colombia, México, Argentina, Chile, Perú, España y Estados Unidos. Cada país aporta formato de moneda, separadores y zona horaria por defecto, todo configurable por gimnasio desde Configuración.

Si te preguntan por el costo o las funciones exactas de cada plan, esa información vive en el precio y las funciones de cada plan de FitStack. Si preguntan qué puede hacer cada persona del equipo dentro del panel, eso corresponde a los roles y permisos del personal.

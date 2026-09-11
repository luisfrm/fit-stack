# Responsabilidades: FitStack vs. Organización (Gym)

> Documento de referencia interna. Última revisión: sept 2026.
> Objetivo: tener clara la línea divisoria de responsabilidad legal/fiscal entre FitStack (Console) y cada Org (Panel), y cómo comunicarla.

## Resumen en una frase

**FitStack registra y documenta transacciones. Nunca es el vendedor legal de una membresía de gimnasio, y hoy tampoco es el emisor de facturas fiscales a nivel Console (porque aún no está constituida como empresa con RIF).**

## Mapa de responsabilidad por nivel

| Nivel | Vendedor | Comprador | ¿Quién factura fiscalmente? |
|---|---|---|---|
| Console (SaaS) | FitStack | Org (gym) | FitStack, **solo cuando exista como empresa con RIF/tax ID**. Hasta entonces: comprobante, no factura. |
| Panel (gym) | Org (gym) | Member | **La Org**, si está registrada como contribuyente formal y decide/está obligada a facturar. Nunca FitStack. |

## Responsabilidad de FitStack

- Registrar con exactitud cada pago: monto, moneda, tasa de cambio aplicada, método, fecha, estado.
- Generar un documento (PDF) claro, consistente y exportable en cualquier momento por la Org — no solo un envío de correo puntual.
- Ser honesto en el documento sobre su naturaleza: es un **comprobante de pago**, no una factura fiscal, salvo que la Org cumpla los tres requisitos de la sección "Cuándo pasar a factura" (ver `facturacion-comprobantes.md`).
- Dar a la Org herramientas para exportar/estructurar su data si necesita facturar por su cuenta.
- No impedir ni encarecer que la Org use esa data en su propio sistema contable externo.
- Documentar en Términos de Servicio que FitStack no asume responsabilidad tributaria de las ventas gym → member.

## Responsabilidad de la Org (gym)

- Decidir si está registrada como contribuyente formal ante su autoridad tributaria (SENIAT, DIAN, SAT, AFIP, SII, SUNAT, etc.). FitStack no verifica ni resuelve esto.
- Si lo está, decidir si sus ventas de membresías requieren factura fiscal a sus miembros, y resolverlo con su propio software homologado o su contador.
- Configurar correctamente sus datos fiscales (`taxId`, `legalName`, `fiscalConfig`) si quiere que el comprobante refleje su identidad legal.
- Cumplir sus propias obligaciones tributarias (IVA/IGV si aplica, IGTF en Venezuela si cobra en USD/cripto). FitStack registra el dato, no calcula ni retiene nada en su nombre.

## Lo que FitStack NUNCA debe hacer

- Mostrar la palabra "Factura" en un documento que no es una factura fiscal homologada.
- Asumir por la Org que está o no registrada como contribuyente.
- Ofrecer un modo "invoice" sin un mecanismo real de homologación fiscal detrás (numeración oficial, conexión con la autoridad tributaria).
- Calcular o retener impuestos en nombre de la Org sin que ella lo haya configurado explícitamente.

## Texto sugerido para comunicar esto a los clientes (Orgs)

**Dentro del producto** (cerca de configuración de pagos / comprobantes):

> "FitStack te ayuda a generar comprobantes de pago para tus miembros. Estos comprobantes no son facturas fiscales electrónicas. Si tu gimnasio está registrado como contribuyente y necesita emitir facturas fiscales a tus clientes, te recomendamos consultar con tu contador sobre cómo complementar este proceso."

**En Términos de Servicio con la Org** (cláusula):

> "FitStack provee herramientas de gestión de cobro y generación de comprobantes de pago. La responsabilidad tributaria de las ventas realizadas por la Organización a sus Miembros — incluyendo cualquier impuesto aplicable y obligación de facturación fiscal — es exclusiva de la Organización."

## Cuándo revisar/actualizar este documento

- Cuando FitStack se constituya legalmente (obtenga RIF) → activar obligación de facturación digital a nivel Console.
- Cuando se integre un proveedor homologado de facturación electrónica (por país) → revisar si se habilita el modo "invoice" para Orgs.
- Cuando se expanda a un nuevo país → agregar su fila en la tabla de mapeo y su autoridad tributaria correspondiente.
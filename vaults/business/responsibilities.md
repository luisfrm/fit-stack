# Responsabilidades: FitStack vs. la organización

> Referencia interna. Objetivo: dejar clara la línea de responsabilidad legal/fiscal entre FitStack (Console) y cada organización (Panel), y cómo comunicarla.
> Ver también: [`fiscal-documents.md`](./fiscal-documents.md) §3, [`organization-receipt-model.md`](./organization-receipt-model.md).

## Resumen

**FitStack registra y documenta transacciones. Nunca es el vendedor legal de una membresía de gimnasio, y hoy tampoco emite facturas fiscales en Console, porque no está constituida como empresa con identificación fiscal.**

| Nivel | Vendedor | Comprador | ¿Quién factura fiscalmente? |
|---|---|---|---|
| Console (SaaS) | FitStack | Organización (gym) | FitStack, **solo cuando exista como empresa con RIF/tax ID**. Hasta entonces: comprobante, no factura |
| Panel (gym) | Organización | Miembro | **La organización**, si está registrada como contribuyente formal y decide o está obligada a facturar. Nunca FitStack |

## Responsabilidad de FitStack

- Registrar con exactitud cada pago: monto, moneda, tasa aplicada, método, fecha y estado.
- Generar un PDF claro y exportable en cualquier momento, no solo un envío puntual por correo.
- Ser honesto sobre la naturaleza del documento: es un **comprobante de pago**, no una factura fiscal, salvo que se cumplan las tres condiciones de [`fiscal-documents.md`](./fiscal-documents.md) §3.
- Dar a la organización herramientas para exportar o estructurar su data si necesita facturar por su cuenta, sin impedir ni encarecer su sistema contable externo.
- Documentar en los Términos de Servicio que FitStack no asume responsabilidad tributaria de las ventas gym → miembro.

## Responsabilidad de la organización

- Decidir si está registrada como contribuyente formal ante su autoridad (SENIAT, DIAN, SAT, AFIP, SII, SUNAT). FitStack no lo verifica.
- Si lo está, decidir si sus ventas de membresías requieren factura fiscal y resolverlo con su software homologado o su contador.
- Configurar bien sus datos fiscales (`taxId`, `legalName`, `fiscalConfig`) si quiere que el comprobante refleje su identidad legal.
- Cumplir sus obligaciones tributarias (IVA/IGV si aplica, IGTF en Venezuela si cobra en divisas). FitStack registra el dato, no calcula ni retiene nada en su nombre.

## Lo que FitStack nunca debe hacer

- Mostrar la palabra "Factura" en un documento que no es una factura fiscal homologada.
- Asumir por la organización que está o no registrada como contribuyente.
- Ofrecer un modo "invoice" sin mecanismo real de homologación detrás.
- Calcular o retener impuestos en nombre de la organización cuando no se ha registrado su condición formal.

## Cómo comunicarlo

**En el producto** (cerca de la configuración de pagos y comprobantes):

> "FitStack te ayuda a generar comprobantes de pago para tus miembros. Estos comprobantes no son facturas fiscales electrónicas. Si tu gimnasio está registrado como contribuyente y necesita emitir facturas fiscales, consulta con tu contador cómo complementar este proceso."

**En los Términos de Servicio** (cláusula):

> "FitStack provee herramientas de gestión de cobro y generación de comprobantes de pago. La responsabilidad tributaria de las ventas realizadas por la Organización a sus Miembros —incluyendo cualquier impuesto aplicable y la obligación de facturación fiscal— es exclusiva de la Organización."

## Cuándo revisar este documento

- Cuando FitStack se constituya legalmente (obtenga RIF): activar la obligación de facturación digital en Console.
- Cuando se integre un proveedor homologado por país: revisar si se habilita el modo "invoice" para organizaciones.
- Cuando se expanda a un país nuevo: añadir su fila y su autoridad tributaria.

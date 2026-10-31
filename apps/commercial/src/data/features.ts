/**
 * Capability catalogue for the homepage.
 *
 * Every line is traceable to `vaults/guides/knowledge-base-rag/`:
 * `how-works-fitstack.md`, `how-works-memberships.md`,
 * `how-works-multi-currency.md` and `how-works-features.md`.
 */

export interface Feature {
  readonly id: string;
  /** Iconify name; must be whitelisted in `astro.config.ts`. */
  readonly icon: string;
  readonly title: string;
  readonly description: string;
  /** Optional supporting line rendered under the description. */
  readonly detail?: string;
}

/** Six cards in the main grid. */
export const PRIMARY_FEATURES: readonly Feature[] = [
  {
    id: "members",
    icon: "lucide:users",
    title: "Miembros y ficha 360",
    description:
      "La ficha central de cada cliente: sus datos, el historial de sus membresías y todos sus pagos.",
    detail:
      "Un cliente puede comprar el mismo plan muchas veces; cada compra queda como una membresía nueva.",
  },
  {
    id: "cumulative",
    icon: "lucide:calendar-days",
    title: "Membresías acumulativas",
    description:
      "Si el cliente renueva antes de vencer, los días nuevos se suman a su fecha de vencimiento actual, no desde hoy.",
    detail: "Ningún día pagado se pierde.",
  },
  {
    id: "currencies",
    icon: "lucide:banknote",
    title: "Pagos en varias monedas",
    description:
      "Cobra en bolívares, pesos, soles, euros o dólares. Cada pago guarda la tasa exacta que se aplicó ese día.",
    detail: "La tasa se consulta sola, se muestra en solo lectura y nunca se escribe a mano.",
  },
  {
    id: "receipts",
    icon: "lucide:receipt",
    title: "Recibos en PDF automáticos",
    description:
      "Al validar un pago, el sistema genera el comprobante y lo envía por correo a la dirección de la ficha del cliente.",
    detail: "Puedes reenviarlo cuando quieras desde el historial de pagos.",
  },
  {
    id: "classes",
    icon: "lucide:dumbbell",
    title: "Clases y control de cupo",
    description: "Horarios grupales con capacidad definida y control de cupo.",
    detail:
      "Los entrenadores se gestionan aparte del personal de caja y gerencia, y pueden tener un perfil público con especialidades.",
  },
  {
    id: "roles",
    icon: "lucide:shield-check",
    title: "Equipo y roles",
    description:
      "Separa quién opera el negocio —Propietario, Gerente y Cajero— de quién da las clases.",
    detail: "Las invitaciones de tu personal interno no consumen cupos del Portal de Miembros.",
  },
];

/** Four capabilities listed below the grid. */
export const SECONDARY_FEATURES: readonly Feature[] = [
  {
    id: "reports",
    icon: "lucide:line-chart",
    title: "Reportes consolidados",
    description:
      "Cada cobro se lleva a tu moneda principal con el equivalente que se guardó en el pago, así el total no cambia cuando cambia la tasa.",
  },
  {
    id: "portal",
    icon: "lucide:smartphone",
    title: "Portal de Miembros",
    description: "Tus clientes consultan su plan vigente, sus clases y su progreso.",
  },
  {
    id: "cms",
    icon: "lucide:layout-dashboard",
    title: "Página web (CMS)",
    description:
      "Inicio, servicios, galería, contacto y blog de tu gimnasio, editados desde el panel.",
  },
  {
    id: "assistant",
    icon: "lucide:sparkles",
    title: "Asistente IA",
    description:
      "Responde dudas sobre Fit-Stack y sobre los datos de tu gimnasio, con créditos mensuales según tu plan.",
  },
];

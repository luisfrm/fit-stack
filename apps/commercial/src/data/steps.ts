/**
 * The three onboarding steps shown on the homepage.
 *
 * Sources: `how-works-fitstack.md` (supported countries and the panel modules),
 * `how-works-memberships.md` (plans, atomic invoicing, automatic receipt) and
 * `how-works-multi-currency.md` (primary currency and timezone configuration).
 */

export interface Step {
  readonly id: string;
  /** Iconify name; must be whitelisted in `astro.config.ts`. */
  readonly icon: string;
  readonly title: string;
  readonly description: string;
  readonly detail: string;
}

export const STEPS: readonly Step[] = [
  {
    id: "configure",
    icon: "lucide:globe",
    title: "Configura tu gimnasio",
    description: "Eliges país, moneda principal y zona horaria.",
    detail:
      "El país define el formato de moneda, los separadores y la zona horaria sugerida. Todo se puede ajustar después.",
  },
  {
    id: "load",
    icon: "lucide:users",
    title: "Carga miembros y planes",
    description: "Armas tu catálogo y registras a tus clientes.",
    detail:
      "Cada plan define nombre, duración (diaria, semanal, mensual o anual), precio, moneda y descripción.",
  },
  {
    id: "charge",
    icon: "lucide:receipt",
    title: "Cobra",
    description: "La membresía y el pago se registran juntos.",
    detail:
      "Si algo falla a mitad de camino, el sistema deja constancia y avisa: no queda un acceso sin respaldo financiero. Al validar el pago, el recibo en PDF sale por correo.",
  },
];

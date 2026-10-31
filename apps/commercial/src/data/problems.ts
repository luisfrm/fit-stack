/**
 * The three problems Fit-Stack solves, taken from the "Qué problema resuelve"
 * section of `vaults/guides/knowledge-base-rag/how-works-fitstack.md`.
 *
 * The access-control card states explicitly that automatic validation is still
 * in development — the knowledge base says so and the site must not overclaim.
 */

export interface Problem {
  readonly id: string;
  /** Iconify name; must be whitelisted in `astro.config.ts`. */
  readonly icon: string;
  readonly problem: string;
  readonly problemDetail: string;
  readonly solution: string;
}

export const PROBLEMS: readonly Problem[] = [
  {
    id: "currency",
    icon: "lucide:banknote",
    problem: "La tasa cambia todos los días y nadie sabe cuál se aplicó",
    problemDetail:
      "Cobras en moneda local con una tasa que se mueve a diario. Si la escribes a mano, el número del reporte deja de ser confiable.",
    solution:
      "El panel consulta la tasa del momento en una fuente pública, la muestra en solo lectura y la guarda junto al pago. Los reportes consolidan cada cobro en tu moneda principal.",
  },
  {
    id: "retention",
    icon: "lucide:calendar-days",
    problem: "Los clientes se van sin que nadie lo note",
    problemDetail:
      "Sin un historial a la vista, una membresía vence y el cliente simplemente deja de aparecer. Nadie lo ve venir porque no hay dónde mirar.",
    solution:
      "La ficha del miembro guarda su historial de membresías y pagos, y cada membresía muestra si está activa, por vencer o vencida. Renovar antes del vencimiento acumula los días nuevos.",
  },
  {
    id: "access",
    icon: "lucide:lock",
    problem: "El acceso se controla de memoria",
    problemDetail:
      "En recepción nadie sabe con certeza quién está al día. La validación manual deja pasar a quien no debería y frena a quien sí.",
    solution:
      "El estado de cada membresía se calcula solo y está a la vista en el panel. La validación automática por QR o biometría está en desarrollo y todavía no se usa en operación.",
  },
];

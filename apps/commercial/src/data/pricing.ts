/**
 * Plans and prices as published on the commercial site.
 *
 * These are REFERENCE values: Fit-Stack defines them in the Console and can
 * change them at any time. Source of truth for the copy and the numbers:
 * `vaults/guides/knowledge-base-rag/how-works-fitstack-pricing.md`.
 *
 * Money is stored as integer cents and only ever formatted through
 * `formatCents` from `@workspace/shared`.
 */
import { centsToUnits, formatCents, ValueConverter } from "@workspace/shared";

/** Every plan is billed monthly in USD, per gym. */
export const PLAN_CURRENCY = "USD";

export interface PlanFeature {
  readonly label: string;
  readonly included: boolean;
}

export interface Plan {
  readonly id: "basico" | "standard" | "premium";
  readonly name: string;
  readonly priceCents: number;
  readonly aiCredits: number;
  readonly tagline: string;
  readonly description: string;
  readonly features: readonly PlanFeature[];
  /** Marks the plan the site recommends. */
  readonly highlight: boolean;
}

/** Every plan includes the administrative panel; differences start below. */
const PANEL_FEATURES: readonly PlanFeature[] = [
  { label: "Panel administrativo completo", included: true },
  { label: "Miembros, planes y membresías", included: true },
  { label: "Pagos y recibos en PDF", included: true },
  { label: "Clases, entrenadores y personal", included: true },
  { label: "Reportes en tu moneda principal", included: true },
];

/**
 * Builds the per-plan feature list so the shared panel features are declared
 * once. Portal seats are deliberately left unquantified: the knowledge base
 * states they are confirmed with the Fit-Stack team, not published per plan.
 */
function planFeatures(options: {
  readonly portal: string;
  readonly website: boolean;
}): readonly PlanFeature[] {
  return [
    ...PANEL_FEATURES,
    { label: options.portal, included: true },
    { label: "Página web (CMS) y blog", included: options.website },
  ];
}

const BASICO: Plan = {
  id: "basico",
  name: "Básico",
  priceCents: 3_000,
  aiCredits: 1_500,
  tagline: "El panel completo para operar el día a día.",
  description:
    "Para gimnasios que necesitan ordenar miembros, membresías y cobros sin sumar herramientas.",
  features: planFeatures({
    portal: "Portal de Miembros (cupos a confirmar)",
    website: false,
  }),
  highlight: false,
};

const STANDARD: Plan = {
  id: "standard",
  name: "Standard",
  priceCents: 4_500,
  aiCredits: 4_000,
  tagline: "Todo el panel, más tu sitio público.",
  description:
    "Para gimnasios que además quieren publicar su sitio y su blog desde el mismo panel.",
  features: planFeatures({
    portal: "Portal de Miembros (cupos a confirmar)",
    website: true,
  }),
  highlight: true,
};

const PREMIUM: Plan = {
  id: "premium",
  name: "Premium",
  priceCents: 7_000,
  aiCredits: 8_000,
  tagline: "Todo lo anterior, con el portal ampliado.",
  description:
    "Para gimnasios que ya usan el Portal de Miembros a diario y necesitan más cupos.",
  features: planFeatures({
    portal: "Portal de Miembros ampliado, con más cupos",
    website: true,
  }),
  highlight: false,
};

/** Ordered list used by the pricing grid. */
export const PLANS: readonly Plan[] = [BASICO, STANDARD, PREMIUM];

/** Direct access by id, so consumers never index the array blindly. */
export const PLAN_BY_ID = {
  basico: BASICO,
  standard: STANDARD,
  premium: PREMIUM,
} as const;

/**
 * The `price = 0` plan is a free plan assigned as an operational courtesy,
 * not a trial: it does not expire on its own and never produces a receipt.
 */
export const FREE_PLAN = {
  priceCents: 0,
  /** Fixed floor values; per-plan portal seats are not published. */
  portalSeats: 10,
  aiCredits: 500,
} as const;

/** Display price, e.g. `30,00 USD`. Never divide cents by hand. */
export function formatPlanPrice(priceCents: number): string {
  return formatCents(priceCents, PLAN_CURRENCY);
}

/** Machine value for structured data, e.g. `30` → `"30.00"`. */
export function planPriceUnits(priceCents: number): string {
  return centsToUnits(priceCents).toFixed(2);
}

/** Display credit count, e.g. `1500` → `1.500`. */
export function formatAiCredits(credits: number): string {
  return ValueConverter.formatInteger(credits, "latam");
}

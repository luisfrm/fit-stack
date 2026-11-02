/**
 * Single source of truth for everything that identifies the Fit-Stack
 * commercial site. Change it here, never inline in a component.
 */
export const SITE = {
  /** Canonical origin. Must match the custom domain attached to the Worker. */
  url: "https://fitstack-commercial.luisrivas.site",
  name: "Fit-Stack",
  legalName: "Fit-Stack",
  lang: "es",
  locale: "es_VE",
  title: "Fit-Stack — El sistema operativo de tu gimnasio",
  description:
    "Miembros, membresías acumulativas, pagos en varias monedas, clases y recibos en PDF. Una sola plataforma para administrar tu gimnasio en Latinoamérica.",
  /**
   * Social preview image (1200×630). Keep `width`/`height` in sync with the
   * real file: scrapers that need explicit dimensions drop the preview.
   */
  ogImage: {
    path: "/brand/og-image.png",
    width: 1200,
    height: 630,
    type: "image/png",
    /** Short alt describing the image itself, not the page copy. */
    alt: "Fit-Stack: registro de un pago en varias monedas y envío del recibo en PDF",
  },
  themeColor: {
    light: "#f9f9fb",
    dark: "#000000",
  },
} as const;

export const CONTACT = {
  email: "soporte@fit-stack.com",
  demoPath: "/probar-demo",
} as const;

/** Primary navigation. Every entry is a real destination. */
export const NAV_LINKS = [
  { label: "Producto", href: "/#producto" },
  { label: "Funciones", href: "/#funciones" },
  { label: "Precios", href: "/#precios" },
  { label: "Preguntas", href: "/#preguntas" },
] as const;

/**
 * Footer links. Internal pages are written with the trailing slash that the
 * canonical URL uses, so no redirect hop is needed when following a link.
 */
export const FOOTER_LINKS = {
  producto: [
    { label: "Qué es Fit-Stack", href: "/#producto" },
    { label: "Funciones", href: "/#funciones" },
    { label: "Precios", href: "/#precios" },
    { label: "Preguntas frecuentes", href: "/#preguntas" },
  ],
  legal: [
    { label: "Términos y condiciones", href: "/terms-and-condition/" },
    { label: "Política de privacidad", href: "/privacy-policy/" },
  ],
} as const;

/** Last review date of the legal documents, shown on both pages. */
export const LEGAL_LAST_UPDATED = "1 de octubre de 2026";

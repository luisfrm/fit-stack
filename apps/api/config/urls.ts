import { env } from "./envs";

type AppEnvironment = "development" | "production";

const URLS: Record<AppEnvironment, { cms: string; console: string; api: string }> = {
  development: {
    cms: "http://localhost:3001",
    console: "http://localhost:3003",
    api: "http://localhost:3000",
  },
  production: {
    cms: "https://panel.luisrivas.site",
    console: "https://console.luisrivas.site",
    api: "https://api.luisrivas.site",
  },
};

// Dominios base para los sitios web multi-tenant (gimnasios).
// En producción, cualquier subdominio de estos dominios será válido como origin.
// Para añadir un dominio custom (ej. un gimnasio compra "powerfit.com"),
// simplemente agregarlo a este array.
const WEB_BASE_DOMAINS: string[] = ["luisrivas.site"];

export const urls = URLS[env.appEnv as AppEnvironment];
export const webBaseDomains = WEB_BASE_DOMAINS;
import { env } from "./envs";
import { urls, webBaseDomains } from "./urls";

const DEV_PORTS = [3001, 3002, 3003] as const;
const DEV_ORIGINS = DEV_PORTS.map((port) => `http://localhost:${port}`);

function buildProdOrigins(): string[] {
  const exact = [urls.cms, urls.console, urls.api];
  const wildcards = webBaseDomains.flatMap((domain) => [
    `https://${domain}`,
    `https://*.${domain}`,
  ]);
  return [...exact, ...wildcards];
}

export const ALLOWED_ORIGINS: string[] = env.isProduction
  ? buildProdOrigins()
  : DEV_ORIGINS;

function escapeRegex(input: string): string {
  return input.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
}

function matchPattern(pattern: string, origin: string): boolean {
  if (!pattern.includes("*")) return origin === pattern;
  const regex = new RegExp(
    "^" + escapeRegex(pattern).replace(/\*/g, "[^/:]+") + "$"
  );
  return regex.test(origin);
}

export function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  return ALLOWED_ORIGINS.some((pattern) => matchPattern(pattern, origin));
}

/**
 * Taxonomía de storage (R2) — política compartida por api-worker, panel y console.
 *
 *   <orgId>/<folder>/<slug>_<shortId>.<ext>      ← assets de una organización
 *   platform/branding/<slug>_<shortId>.<ext>     ← branding de la plataforma
 *
 * El namespace de comprobantes emitidos (`receipts/<org>/<año>/<n>.pdf` y
 * `platform/receipts/<año>/FS-<n>.pdf`) es determinista y solo lo escribe el
 * renderer; se lee por las rutas autenticadas de comprobantes.
 *
 * La construcción de keys (con sufijo aleatorio y saneado de carpeta) vive en
 * `apps/api-worker/src/lib/storage-keys.ts`; aquí vive solo lo que necesitan
 * las tres apps: el prefijo de aislamiento y la política de "público".
 */

/** Única carpeta de organización servida públicamente (assets del sitio/CMS). */
export const PUBLIC_ORG_FOLDER = 'cms';

/** Scope de plataforma (sin organización). */
export const PLATFORM_SCOPE = 'platform';

/** Único scope de plataforma servido públicamente: logo de FitStack (login/correos). */
export const PLATFORM_BRANDING_FOLDER = 'branding';
export const PLATFORM_BRANDING_PREFIX = `${PLATFORM_SCOPE}/${PLATFORM_BRANDING_FOLDER}/`;

/**
 * Prefijo R2 de TODO lo que pertenece a una organización. Toda key org-scoped
 * debe empezar por aquí: es el guard de aislamiento multi-tenant.
 */
export function orgStoragePrefix(orgId: string): string {
  return `${orgId}/`;
}

/** `key` cae dentro del scope de la organización (nunca acepta keys ajenas). */
export function isOrgStorageKey(orgId: string, key: string): boolean {
  return Boolean(orgId) && key.startsWith(orgStoragePrefix(orgId));
}

/**
 * Único criterio de "público por diseño": assets del sitio (`<orgId>/cms/…`) y
 * branding de la plataforma. Todo lo demás (avatares, logos de org, evidencia de
 * pago, comprobantes) se entrega por las rutas autenticadas.
 *
 * Lo consumen: el route público de api-worker (allowlist) y el `getMediaUrl` de
 * panel/console (URL pública vs. proxy autenticado).
 */
export function isPublicStorageKey(key: string): boolean {
  if (key.startsWith(PLATFORM_BRANDING_PREFIX)) return true;
  const [scope, folder] = key.split('/');
  return Boolean(scope) && folder === PUBLIC_ORG_FOLDER;
}

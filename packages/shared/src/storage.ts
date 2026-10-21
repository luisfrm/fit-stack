/**
 * Storage taxonomy (R2) — policy shared by api-worker, panel, and console.
 *
 *   <orgId>/<folder>/<slug>_<shortId>.<ext>      ← organization assets
 *   platform/branding/<slug>_<shortId>.<ext>     ← platform branding
 *
 * The issued receipt namespace (`receipts/<org>/<year>/<n>.pdf` and
 * `platform/receipts/<year>/FS-<n>.pdf`) is deterministic and written solely
 * by the renderer; it is accessed via authenticated receipt endpoints.
 *
 * Key construction (with random suffix and folder sanitization) lives in
 * `apps/api-worker/src/lib/storage-keys.ts`; this file hosts what all apps need:
 * the tenant isolation prefix and the "public" policy.
 */

/** Sole organization folder publicly served (site/CMS assets). */
export const PUBLIC_ORG_FOLDER = 'cms';

/** Platform scope (no organization). */
export const PLATFORM_SCOPE = 'platform';

/** Sole platform scope publicly served: FitStack logo (login/emails). */
export const PLATFORM_BRANDING_FOLDER = 'branding';
export const PLATFORM_BRANDING_PREFIX = `${PLATFORM_SCOPE}/${PLATFORM_BRANDING_FOLDER}/`;

/**
 * R2 prefix for EVERYTHING belonging to an organization. Every org-scoped key
 * must start with this prefix: multi-tenant isolation guard.
 */
export function orgStoragePrefix(orgId: string): string {
  return `${orgId}/`;
}

/** Checks if `key` falls within the organization scope (never accepts foreign keys). */
export function isOrgStorageKey(orgId: string, key: string): boolean {
  return Boolean(orgId) && key.startsWith(orgStoragePrefix(orgId));
}

/**
 * Sole criteria for "public by design": site assets (`<orgId>/cms/…`) and
 * platform branding. Everything else (avatars, org logos, payment proof,
 * receipts) is served via authenticated routes.
 *
 * Consumed by: api-worker public route (allowlist) and panel/console `getMediaUrl`
 * (public URL vs authenticated proxy).
 */
export function isPublicStorageKey(key: string): boolean {
  if (key.startsWith(PLATFORM_BRANDING_PREFIX)) return true;
  const [scope, folder] = key.split('/');
  return Boolean(scope) && folder === PUBLIC_ORG_FOLDER;
}

/**
 * Resolves the URL used by the UI to display a stored asset.
 *
 * Public by design (`<orgId>/cms/…`, `platform/branding/…`): direct R2 URL.
 * Private (avatars, logos, payment proof): authenticated proxy `/api/media`,
 * which forwards the cookie to the API — never a guessable URL.
 *
 * @param key          Stored key (or an already absolute URL).
 * @param r2PublicUrl  R2 public base URL of the running app (`NEXT_PUBLIC_R2_URL`).
 */
export function buildMediaUrl(
  key: string | null | undefined,
  r2PublicUrl: string,
): string {
  if (!key) return '';
  if (key.startsWith('http')) return key;

  const cleanKey = key.startsWith('/') ? key.slice(1) : key;

  if (isPublicStorageKey(cleanKey)) {
    const baseUrl = r2PublicUrl.trim();
    if (!baseUrl) {
      throw new Error(
        'buildMediaUrl: r2PublicUrl is required to resolve a public asset',
      );
    }
    const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    return `${cleanBaseUrl}/${cleanKey}`;
  }

  return `/api/media?key=${encodeURIComponent(cleanKey)}`;
}

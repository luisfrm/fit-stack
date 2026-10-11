/**
 * R2 storage key construction (worker).
 *
 * Taxonomy `<orgId>/<folder>/…` and the "public" policy live in
 * `@workspace/shared/storage` because they are consumed by panel and console;
 * this file contains worker-specific logic: key sanitization and construction.
 *
 * The issued receipts namespace (`receipts/<org>/<year>/<n>.pdf` and
 * `platform/receipts/<year>/FS-<n>.pdf`) is NOT constructed here: it is deterministic,
 * written by the renderer (`putFile`), and read exclusively through authenticated receipt routes.
 * Upload routes can never target it (guard enforces `key.startsWith('<orgId>/')`).
 */
import { orgStoragePrefix } from '@workspace/shared';

/**
 * Key `scope`: `orgId` (organization assets) or `PLATFORM_SCOPE`.
 * Prefix policy and public allowlist live in `@workspace/shared/storage`.
 */

/** Default folder: generates no extra path segment (file lives at scope root). */
export const DEFAULT_FOLDER = 'general';

export function getFileExtension(filename: string): string {
  const lastDotIndex = filename.lastIndexOf('.');
  if (lastDotIndex === -1) return 'bin';
  // Filename is client-controlled: sanitized so it cannot introduce path separators
  // or alter the key (`png/../x` is not a valid extension).
  const clean = filename
    .slice(lastDotIndex + 1)
    .toLowerCase()
    .replaceAll(/[^a-z0-9]/g, '');
  return clean.slice(0, 12) || 'bin';
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .replaceAll(/[^a-z0-9_-]/g, '-')
    .replaceAll(/-+/g, '-')
    .replaceAll(/^-|-$/g, '')
    .slice(0, 50);
}

/**
 * Sanitized folder segment (`''` when not applicable). `slugify` neutralizes
 * `../`, `/`, and any separator, so client-supplied folder names cannot
 * escape the organization prefix.
 */
export function safeFolderSegment(folder?: string): string {
  if (!folder) return '';
  const slug = slugify(folder);
  if (!slug || slug === DEFAULT_FOLDER) return '';
  return slug;
}

/** Listing prefix (entire organization or a specific folder). */
export function orgStorageListPrefix(orgId: string, folder?: string): string {
  const segment = safeFolderSegment(folder);
  return segment ? `${orgId}/${segment}/` : orgStoragePrefix(orgId);
}

/**
 * Builds a storage key for R2.
 * `scope` is `orgId` (organization assets) or `PLATFORM_SCOPE`.
 */
export function constructStorageKey(
  scope: string,
  folder: string | undefined,
  filename: string,
  customName?: string,
): string {
  const extension = getFileExtension(filename);
  const lastDotIndex = filename.lastIndexOf('.');
  const rawBaseName = lastDotIndex === -1 ? filename : filename.slice(0, lastDotIndex);
  const slug = slugify(customName || rawBaseName) || 'file';
  const shortId = crypto.randomUUID().split('-')[0];

  const segment = safeFolderSegment(folder);
  const folderPath = segment ? `${segment}/` : '';
  return `${scope}/${folderPath}${slug}_${shortId}.${extension}`;
}

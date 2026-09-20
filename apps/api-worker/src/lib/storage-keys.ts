/**
 * Construcción de storage keys de R2 (worker).
 *
 * La taxonomía `<orgId>/<folder>/…` y la política de "público" viven en
 * `@workspace/shared/storage` porque también las consumen panel y console; aquí
 * está lo que solo usa el worker: saneado y construcción de la key.
 *
 * El namespace de comprobantes emitidos (`receipts/<org>/<año>/<n>.pdf` y
 * `platform/receipts/<año>/FS-<n>.pdf`) NO se construye aquí: es determinista, lo
 * escribe el renderer (`putFile`) y solo se lee por las rutas autenticadas de
 * comprobantes. Las rutas de upload jamás pueden alcanzarlo (su guard exige
 * `key.startsWith('<orgId>/')`).
 */
import { orgStoragePrefix } from '@workspace/shared';

/**
 * `scope` de la key: el `orgId` (assets de la organización) o `PLATFORM_SCOPE`.
 * La política de prefijo/allowlist pública vive en `@workspace/shared/storage`.
 */

/** Carpeta por defecto: no genera segmento (el archivo vive en la raíz del scope). */
export const DEFAULT_FOLDER = 'general';

export function getFileExtension(filename: string): string {
  const lastDotIndex = filename.lastIndexOf('.');
  if (lastDotIndex === -1) return 'bin';
  // El nombre lo controla el cliente: se limpia para que nunca pueda introducir
  // separadores ni alterar la key (`png/../x` no es una extensión válida).
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
 * Segmento de carpeta saneado (`''` cuando no aplica). `slugify` neutraliza
 * `../`, `/` y cualquier separador, así que una carpeta del cliente nunca puede
 * escapar del prefijo de la organización.
 */
export function safeFolderSegment(folder?: string): string {
  if (!folder) return '';
  const slug = slugify(folder);
  if (!slug || slug === DEFAULT_FOLDER) return '';
  return slug;
}

/** Prefijo de listado (organización completa o una carpeta concreta). */
export function orgStorageListPrefix(orgId: string, folder?: string): string {
  const segment = safeFolderSegment(folder);
  return segment ? `${orgId}/${segment}/` : orgStoragePrefix(orgId);
}

/**
 * Builds a storage key for R2.
 * `scope` es el `orgId` (assets de la organización) o `PLATFORM_SCOPE`.
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

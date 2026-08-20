export function getFileExtension(filename: string): string {
  const lastDotIndex = filename.lastIndexOf('.');
  if (lastDotIndex === -1) return 'bin';
  return filename.slice(lastDotIndex + 1);
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
 * Builds a storage key for R2.
 * `scope` is either `cms/${orgId}` (org-scoped uploads) or `platform`
 * (platform assets with no organization context, e.g. branding).
 */
export function constructStorageKey(
  scope: string,
  folder: string,
  filename: string,
  customName?: string,
): string {
  const extension = getFileExtension(filename);
  const baseName = customName || filename.slice(0, filename.lastIndexOf('.')) || filename;

  const slug = slugify(baseName);
  const shortId = crypto.randomUUID().split('-')[0];

  const folderPath = folder && folder !== 'general' ? `${folder}/` : '';
  return `${scope}/${folderPath}${slug}_${shortId}.${extension}`;
}
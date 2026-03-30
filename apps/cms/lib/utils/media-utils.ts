/**
 * Utility to get the public URL for a media file stored in R2.
 * @param key The key of the file in the R2 bucket.
 * @returns The full public URL.
 */
export function getMediaUrl(key: string | null | undefined): string {
  if (!key) return "";

  // If it's already an absolute URL (e.g. starts with http), return it as is
  if (key.startsWith("http")) {
    return key;
  }

  const baseUrl = process.env.NEXT_PUBLIC_R2_URL;

  if (!baseUrl) {
    throw new Error("NEXT_PUBLIC_R2_URL is not defined");
  }

  // Ensure we don't have double slashes
  const cleanBaseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const cleanKey = key.startsWith("/") ? key.slice(1) : key;

  return `${cleanBaseUrl}/${cleanKey}`;
}

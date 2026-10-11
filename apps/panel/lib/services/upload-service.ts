import { isPublicStorageKey } from "@workspace/shared";
import { api, type ApiFetchOptions } from "@/lib/api/client";
import { env } from "@/lib/config/envs";

export interface FileItem {
  key: string;
  /** Direct public URL; `null` when asset is authenticated-only. */
  url: string | null;
  size: number;
  uploadedAt: string;
  name: string;
}

/**
 * Service to handle file uploads, listing, and deletion with R2 storage.
 *
 * Organization is resolved by API from session: this client NEVER sends
 * `organizationId` (requesting another gym's folder is impossible from here).
 * Resulting key: `<orgId>/<folder>/<name>_<id>.<ext>`.
 */
export const uploadService = {
  /**
   * Generates a presigned URL and uploads the file directly.
   */
  async uploadFile(
    file: File,
    customName?: string,
    folder?: string,
  ): Promise<string> {
    const data = await api<{ presignedUrl: string; key: string }>(
      "/upload/presigned",
      {
        method: "POST",
        body: {
          filename: file.name,
          customName: customName || undefined,
          folder: folder || undefined,
          contentType: file.type,
        },
      },
    );

    await api("/upload/direct", {
      method: "PUT",
      query: { key: data.key },
      body: file,
      headers: { "Content-Type": file.type },
    });

    return data.key;
  },

  async listFiles(
    folder: string = "",
    options?: ApiFetchOptions,
  ): Promise<FileItem[]> {
    return await api<FileItem[]>("/upload", {
      query: { folder },
      ...options,
    });
  },

  async deleteFile(key: string): Promise<void> {
    await api("/upload", { method: "DELETE", query: { key } });
  },

  /**
   * URL used by the UI to display a file.
   *
   * Public by design (`<orgId>/cms/…`, branding): direct R2 URL.
   * Private (avatars, logos, payment evidence): authenticated panel proxy
   * (`/api/media`), which forwards cookie to API — never a guessable URL.
   */
  getMediaUrl(key: string | null | undefined): string {
    if (!key) return "";
    if (key.startsWith("http")) return key;

    const cleanKey = key.startsWith("/") ? key.slice(1) : key;

    if (isPublicStorageKey(cleanKey)) {
      const baseUrl = env.r2Url;
      const cleanBaseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
      return `${cleanBaseUrl}/${cleanKey}`;
    }

    return `/api/media?key=${encodeURIComponent(cleanKey)}`;
  },
};

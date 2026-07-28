import { ofetch } from "ofetch";
import { api } from "@/lib/api/client";
import { env } from "@/lib/config/envs";

export interface FileItem {
  key: string;
  size: number;
  lastModified: string;
}

/**
 * Service to handle file uploads, listing, and deletion with R2 storage.
 */
export const uploadService = {
  /**
   * Generates a presigned URL and uploads the file directly.
   * Path format: [organizationId]/[folder]/[filename]_[shortId].[ext]
   */
  async uploadFile(
    file: File,
    customName?: string,
    organizationId?: string,
    folder?: string,
  ): Promise<string> {
    const data = await api<{ presignedUrl: string; key: string }>(
      "/upload/presigned",
      {
        method: "POST",
        body: {
          filename: file.name,
          customName: customName || undefined,
          organizationId: organizationId || undefined,
          folder: folder || undefined,
          contentType: file.type,
        },
      },
    );

    // Direct binary PUT to external R2 presigned URL.
    // Uses standalone ofetch to bypass internal api client's baseURL and session cookie headers.
    await ofetch(data.presignedUrl, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type },
    });

    return data.key;
  },

  /**
   * Lists files in a specific folder (filtered by active organization).
   * @param folder Subfolder to list (e.g., 'logos', 'coaches')
   */
  async listFiles(folder: string = ""): Promise<FileItem[]> {
    return await api<FileItem[]>("/upload", { query: { folder } });
  },

  /**
   * Deletes a file by its full key.
   * @param key The full key of the file (e.g., 'org123/logos/image.png')
   */
  async deleteFile(key: string): Promise<void> {
    await api("/upload", { method: "DELETE", query: { key } });
  },

  /**
   * Utility to get the public URL for a media file stored in R2.
   * @param key The key of the file in the R2 bucket.
   * @returns The full public URL.
   */
  getMediaUrl(key: string | null | undefined): string {
    if (!key) return "";
    if (key.startsWith("http")) return key;

    const baseUrl = env.r2Url;
    const cleanBaseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
    const cleanKey = key.startsWith("/") ? key.slice(1) : key;

    return `${cleanBaseUrl}/${cleanKey}`;
  },
};

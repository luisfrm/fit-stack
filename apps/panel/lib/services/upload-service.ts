import { api, type ApiFetchOptions } from "@/lib/api/client";
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

  getMediaUrl(key: string | null | undefined): string {
    if (!key) return "";
    if (key.startsWith("http")) return key;

    const baseUrl = env.r2Url;
    const cleanBaseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
    const cleanKey = key.startsWith("/") ? key.slice(1) : key;

    return `${cleanBaseUrl}/${cleanKey}`;
  },
};

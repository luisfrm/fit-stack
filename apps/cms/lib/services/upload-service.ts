import axios from "axios";
import { apiClient } from "../api-client";
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
  async uploadFile(file: File, folder: string = "general", customName?: string): Promise<string> {
    const { data } = await apiClient.post<{ presignedUrl: string; key: string }>("/upload/presigned", {
      filename: file.name,
      customName,
      contentType: file.type,
      folder
    });

    // We use direct axios here because apiClient has a fixed baseURL for our own API
    await axios.put(data.presignedUrl, file, {
      headers: {
        "Content-Type": file.type,
      },
    });

    return data.key;
  },

  /**
   * Lists files in a specific folder (filtered by active organization).
   * @param folder Subfolder to list (e.g., 'logos', 'coaches')
   */
  async listFiles(folder: string = ""): Promise<FileItem[]> {
    const { data } = await apiClient.get<FileItem[]>("/upload", {
      params: { folder }
    });
    return data;
  },

  /**
   * Deletes a file by its full key.
   * @param key The full key of the file (e.g., 'org123/logos/image.png')
   */
  async deleteFile(key: string): Promise<void> {
    await apiClient.delete("/upload", {
      params: { key }
    });
  },

  /**
   * Utility to get the public URL for a media file stored in R2.
   * @param key The key of the file in the R2 bucket.
   * @returns The full public URL.
   */
  getMediaUrl(key: string | null | undefined): string {
    if (!key) return "";

    // If it's already an absolute URL (e.g. starts with http), return it as is
    if (key.startsWith("http")) {
      return key;
    }

    const baseUrl = env.r2Url;

    // Ensure we don't have double slashes
    const cleanBaseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
    const cleanKey = key.startsWith("/") ? key.slice(1) : key;

    return `${cleanBaseUrl}/${cleanKey}`;
  }
};

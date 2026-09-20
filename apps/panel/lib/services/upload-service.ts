import { isPublicStorageKey } from "@workspace/shared";
import { api, type ApiFetchOptions } from "@/lib/api/client";
import { env } from "@/lib/config/envs";

export interface FileItem {
  key: string;
  /** URL pública directa; `null` cuando el asset solo se entrega autenticado. */
  url: string | null;
  size: number;
  uploadedAt: string;
  name: string;
}

/**
 * Service to handle file uploads, listing, and deletion with R2 storage.
 *
 * La organización la resuelve el API desde la sesión: este cliente NUNCA manda
 * `organizationId` (pedir la carpeta de otro gimnasio es imposible desde aquí).
 * Key resultante: `<orgId>/<folder>/<nombre>_<id>.<ext>`.
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
   * URL con la que la UI muestra un archivo.
   *
   * Público por diseño (`<orgId>/cms/…`, branding): URL directa de R2.
   * Privado (avatares, logos, evidencia de pago): proxy autenticado del panel
   * (`/api/media`), que reenvía la cookie al API — nunca una URL adivinable.
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

import { isPublicStorageKey } from "@workspace/shared";
import { api } from "@/lib/api/client";
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
 * El console NO tiene organización activa en la sesión, así que la org destino
 * de un asset de gimnasio viaja por **path** (`/platform/organizations/:orgId/upload`)
 * y el branding vive en su propio scope (`/platform/upload`, solo `platform/branding`).
 */
export const uploadService = {
  /**
   * Presigned + direct upload de un asset DE UNA ORGANIZACIÓN (logo, evidencia
   * de pago). La organización es obligatoria: no hay fallback a la sesión.
   * Key resultante: `<orgId>/<folder>/<nombre>_<id>.<ext>`.
   */
  async uploadFile(
    file: File,
    organizationId: string,
    customName?: string,
    folder?: string,
  ): Promise<string> {
    const base = `/platform/organizations/${organizationId}/upload`;

    const data = await api<{ presignedUrl: string; key: string }>(
      `${base}/presigned`,
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

    await api(`${base}/direct`, {
      method: "PUT",
      query: { key: data.key },
      body: file,
      headers: { "Content-Type": file.type },
    });

    return data.key;
  },

  /**
   * Lists files of an organization's folder.
   * @param folder Subfolder to list (e.g., 'cms', 'receipts')
   */
  async listFiles(organizationId: string, folder: string = ""): Promise<FileItem[]> {
    return await api<FileItem[]>(`/platform/organizations/${organizationId}/upload`, {
      query: { folder },
    });
  },

  /**
   * Deletes an organization asset by its full key.
   * @param key The full key of the file (e.g., '<orgId>/receipts/image.png')
   */
  async deleteFile(organizationId: string, key: string): Promise<void> {
    await api(`/platform/organizations/${organizationId}/upload`, {
      method: "DELETE",
      query: { key },
    });
  },

  /**
   * Uploads a platform-level asset (no organization context): branding.
   * Path format: platform/branding/[filename]_[shortId].[ext]
   */
  async uploadPlatformFile(file: File, customName?: string): Promise<string> {
    const data = await api<{ presignedUrl: string; key: string }>(
      "/platform/upload/presigned",
      {
        method: "POST",
        body: {
          filename: file.name,
          customName: customName || undefined,
          contentType: file.type,
        },
      },
    );

    await api("/platform/upload/direct", {
      method: "PUT",
      query: { key: data.key },
      body: file,
      headers: { "Content-Type": file.type },
    });

    return data.key;
  },

  /** Lists platform branding assets. */
  async listPlatformFiles(): Promise<FileItem[]> {
    return await api<FileItem[]>("/platform/upload");
  },

  /**
   * Deletes a platform branding asset by its full key.
   * @param key The full key of the file (e.g., 'platform/branding/logo.png')
   */
  async deletePlatformFile(key: string): Promise<void> {
    await api("/platform/upload", { method: "DELETE", query: { key } });
  },

  /**
   * URL con la que la UI muestra un archivo.
   *
   * Público por diseño (`<orgId>/cms/…`, branding): URL directa de R2.
   * Privado (logos de org, evidencia de pago): proxy autenticado del console
   * (`/api/media`), que resuelve la org desde la propia key y reenvía la cookie.
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

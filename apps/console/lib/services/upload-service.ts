import { buildMediaUrl } from "@workspace/shared";
import { api } from "@/lib/api/client";
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
 * Console does NOT have an active organization in session, so the target
 * org of a gym asset travels via **path** (`/platform/organizations/:orgId/upload`)
 * and branding lives in its own scope (`/platform/upload`, only `platform/branding`).
 */
export const uploadService = {
  /**
   * Presigned + direct upload for AN ORGANIZATION ASSET (logo, payment
   * proof). The organization is mandatory: there is no fallback to session.
   * Resulting key: `<orgId>/<folder>/<name>_<id>.<ext>`.
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
   * URL used by the UI to display a file.
   *
   * Public by design (`<orgId>/cms/…`, branding): direct R2 URL.
   * Private (org logos, payment evidence): authenticated console proxy
   * (`/api/media`), which resolves the org from the key itself and forwards the cookie.
   *
   * Policy lives in `@workspace/shared` so both apps resolve assets the same.
   */
  getMediaUrl(key: string | null | undefined): string {
    return buildMediaUrl(key, env.r2Url);
  },
};

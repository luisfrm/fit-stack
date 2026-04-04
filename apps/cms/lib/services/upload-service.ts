import { apiClient } from "../api-client";

/**
 * Service to handle file uploads to Cloudflare R2 via presigned URLs.
 */
export const uploadService = {
  /**
   * Generates a presigned URL and uploads the file directly.
   * @param file The file object to upload
   * @param folder Destination folder in the bucket
   * @param customName Optional custom name for the file
   * @returns The key (path) of the uploaded file
   */
  async uploadFile(file: File, folder: string = "general", customName?: string): Promise<string> {
    const filename = customName || file.name;
    
    const response = await apiClient.post<{ presignedUrl: string; key: string }>("/upload/presigned", {
      filename,
      contentType: file.type,
      folder
    });

    const uploadResponse = await fetch(response.data.presignedUrl, {
      method: "PUT",
      body: file,
      headers: {
        "Content-Type": file.type,
      },
    });

    if (!uploadResponse.ok) {
      throw new Error("Fallo al subir el archivo. Revisa los permisos del storage.");
    }

    return response.data.key;
  }
};

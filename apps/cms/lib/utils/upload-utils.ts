import { apiClient } from "@/lib/api-client";

/**
 * Uploads a file to R2 using a presigned URL.
 * @param file The file to upload.
 * @param folder The destination folder in the bucket.
 * @returns The key (path) of the uploaded file.
 */
export async function uploadFile(file: File, folder: string = "gym"): Promise<string> {
  // 1. Get presigned URL from our API
  const { data } = await apiClient.post<{ presignedUrl: string; key: string }>("/upload/presigned", {
    filename: file.name,
    contentType: file.type,
    folder,
  });

  // 2. Upload to Cloudflare R2 directly from browser
  const uploadResponse = await fetch(data.presignedUrl, {
    method: "PUT",
    body: file,
    headers: {
      "Content-Type": file.type,
    },
  });

  if (!uploadResponse.ok) {
    throw new Error("Fallo al subir el archivo al servidor de almacenamiento.");
  }

  return data.key;
}

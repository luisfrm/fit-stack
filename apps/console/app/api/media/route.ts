import { isOrgStorageKey } from "@workspace/shared";
import { apiBlob } from "@/lib/api/client";

export const dynamic = "force-dynamic";

/**
 * Proxy autenticado de los assets PRIVADOS de una organización vistos desde el
 * console (logo de la org, evidencia de pago).
 *
 * El console no tiene organización activa: la org se resuelve del **primer
 * segmento de la key** y se reenvía al api-worker por path
 * (`GET /api/platform/organizations/:orgId/upload/file?key=`), que valida org
 * existente + prefijo de la key con permiso de plataforma.
 */
export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get("key");
  if (!key) {
    return new Response("Key is required", { status: 400 });
  }

  const orgId = key.split("/")[0] ?? "";
  if (!orgId || !isOrgStorageKey(orgId, key)) {
    return new Response("Key is required", { status: 400 });
  }

  try {
    const blob = await apiBlob(`/platform/organizations/${orgId}/upload/file`, {
      query: { key },
    });
    return new Response(blob, {
      headers: {
        "content-type": blob.type || "application/octet-stream",
        "cache-control": "private, max-age=300",
      },
    });
  } catch {
    return new Response("File not found", { status: 404 });
  }
}

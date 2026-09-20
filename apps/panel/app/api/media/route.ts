import { apiBlob } from "@/lib/api/client";

export const dynamic = "force-dynamic";

/**
 * Proxy autenticado de los assets PRIVADOS de la organización (avatares, logo,
 * evidencia de pago).
 *
 * El bucket solo sirve públicamente los assets del sitio (`<orgId>/cms/…`) y el
 * branding de la plataforma. Todo lo demás se pide aquí: este handler reenvía la
 * cookie de sesión al api-worker (`GET /api/upload/file?key=`), que es quien
 * autoriza (org de la sesión + prefijo de la key). La URL nunca es adivinable
 * desde el navegador.
 */
export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get("key");
  if (!key) {
    return new Response("Key is required", { status: 400 });
  }

  try {
    const blob = await apiBlob<Blob>("/upload/file", { query: { key } });
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

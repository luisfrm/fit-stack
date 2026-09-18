import { ofetch, type FetchContext, type FetchOptions } from "ofetch";
import { env } from "@/lib/config/envs";
import type { ApiFetchOptions } from "./types";

const isServer = typeof window === "undefined";

export const api = ofetch.create({
  baseURL: `${env.apiBaseUrl}/api`,
  retry: 1,
  timeout: 30_000,

  async onRequest({ options }) {
    if (isServer) {
      const { cookies } = await import("next/headers");
      const cookieStore = await cookies();
      options.headers.set("cookie", cookieStore.toString());
    } else {
      options.credentials = "include";
    }
  },

  onResponseError({ response }) {
    if (isServer) return;
    const body = response?._data as { code?: string } | undefined;
    if (body?.code === "ORGANIZATION_NOT_FOUND") {
      window.location.href = "/reset-org-context";
    }
  },
});

/**
 * Fetch a binary response (e.g. a PDF blob) CON autenticación: mismo
 * `onRequest` que `api` (cookie en server / `credentials:include` en
 * cliente). No usar `<a href>` directo: perdería el manejo de 401/404 y
 * expondría la URL del API en el DOM.
 */
export async function apiBlob(
  path: string,
  options: Omit<ApiFetchOptions<"blob">, "responseType"> = {},
): Promise<Blob> {
  return await ofetch<Blob, "blob">(path, {
    baseURL: `${env.apiBaseUrl}/api`,
    retry: 1,
    timeout: 30_000,
    ...options,
    responseType: "blob",
    headers: options.headers,
    async onRequest(context: FetchContext) {
      if (isServer) {
        const { cookies } = await import("next/headers");
        const cookieStore = await cookies();
        context.options.headers.set("cookie", cookieStore.toString());
      } else {
        context.options.credentials = "include";
      }
    },
  } as unknown as FetchOptions<"blob">);
}

export type { ApiFetchOptions };

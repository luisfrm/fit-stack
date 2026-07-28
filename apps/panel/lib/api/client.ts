import { ofetch } from "ofetch";
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
 * Fetch a binary response (e.g. a PDF blob).
 * ofetch's generics don't support `responseType: "blob"` together with
 * `ApiFetchOptions<R>`, so this helper wraps the raw `ofetch` call.
 */
export async function apiBlob<T = unknown>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  return (await ofetch<T>(path, {
    baseURL: `${env.apiBaseUrl}/api`,
    retry: 1,
    timeout: 30_000,
    responseType: "blob",
    ...options,
    headers: options.headers,
  } as Parameters<typeof ofetch<T>>[1])) as T;
}

export type { ApiFetchOptions };

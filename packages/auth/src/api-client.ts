/**
 * HTTP client for the Fit-Stack API, shared by `apps/panel` and `apps/console`.
 *
 * This module lives in `@workspace/auth` because that package already owns the
 * frontend runtime concerns it needs: `requireApiBaseUrl()` (the single
 * resolver for `NEXT_PUBLIC_API_BASE_URL`) and the dynamic `next/headers`
 * import. `@workspace/shared` cannot host it: that package is edge-safe and is
 * imported by both Cloudflare Workers.
 *
 * Each app creates ONE instance from its own `lib/api/client.ts`, which keeps
 * the `api` / `apiBlob` / `ApiFetchOptions` surface its services already use.
 */
import {
  ofetch,
  type FetchContext,
  type FetchOptions,
  type ResponseType,
} from "ofetch";
import { formatApiErrorMessage } from "@workspace/shared";
import { requireApiBaseUrl } from "./env";

/** Next.js cache options accepted by `ofetch` through `next`. */
export type NextFetchConfig = {
  revalidate?: number | false;
  tags?: string[];
};

/**
 * Options accepted by the API client: ofetch options plus Next's cache config.
 * `body` is re-declared so callers can pass a `File`/`Blob` without fighting
 * ofetch's generic.
 */
export type ApiFetchOptions<R extends ResponseType = "json"> = Omit<
  FetchOptions<R>,
  "body"
> & {
  body?: FetchOptions<R>["body"];
  next?: NextFetchConfig;
};

export interface CreateApiClientOptions {
  /** Path appended to the API base URL. Defaults to `/api`. */
  readonly basePath?: string;
  /**
   * Called on the client when the API answers `ORGANIZATION_NOT_FOUND`
   * (the active organization no longer exists). The app decides how to
   * navigate: a fetch interceptor cannot call a React hook.
   */
  readonly onOrganizationNotFound?: () => void;
  readonly retry?: number;
  readonly timeout?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Forwards the request cookies on the server and sends credentials in the
 * browser. Used by both `api` and `apiBlob` so they cannot drift.
 */
async function attachAuth(context: FetchContext): Promise<void> {
  if (typeof window === "undefined") {
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    context.options.headers.set("cookie", cookieStore.toString());
    return;
  }
  context.options.credentials = "include";
}

/**
 * Reads the business `code` from an error payload.
 *
 * JSON responses expose it directly. A `responseType: "blob"` request (PDF
 * downloads) parses the error body as a Blob even when the API answered JSON,
 * so the text is decoded best-effort; a non-JSON body simply has no code.
 */
async function readErrorCode(body: unknown): Promise<string | undefined> {
  if (isRecord(body) && typeof body.code === "string") {
    return body.code;
  }
  if (typeof Blob !== "undefined" && body instanceof Blob) {
    try {
      const parsed: unknown = JSON.parse(await body.text());
      if (isRecord(parsed) && typeof parsed.code === "string") {
        return parsed.code;
      }
    } catch {
      // Not JSON (e.g. an HTML proxy error page): no business code.
    }
  }
  return undefined;
}

/**
 * Response-error interceptor shared by `api` and `apiBlob`, so a PDF download
 * and a JSON request react the same way.
 *
 * - `ORGANIZATION_NOT_FOUND` → notifies the app (event → `router.replace`).
 * - Zod/API validation errors (JSON only) → readable string so React never
 *   renders a raw object as a child.
 */
function createResponseErrorHandler(onOrganizationNotFound?: () => void) {
  return async ({ response }: FetchContext): Promise<void> => {
    if (typeof window === "undefined") return;

    const body: unknown = response?._data;

    const code = await readErrorCode(body);
    if (code === "ORGANIZATION_NOT_FOUND") {
      onOrganizationNotFound?.();
    }

    if (isRecord(body) && isRecord(body.error)) {
      const formatted = formatApiErrorMessage(body);
      if (formatted) {
        body.error = formatted;
      }
    }
  };
}

/**
 * Builds the API client instance for an app.
 *
 * Throws when `NEXT_PUBLIC_API_BASE_URL` is missing (AGENTS.md §10: missing
 * configuration is a visible error, never a silent fallback).
 */
export function createApiClient(options: CreateApiClientOptions = {}) {
  const baseURL = `${requireApiBaseUrl()}${options.basePath ?? "/api"}`;
  const retry = options.retry ?? 1;
  const timeout = options.timeout ?? 30_000;
  const handleResponseError = createResponseErrorHandler(
    options.onOrganizationNotFound,
  );

  const api = ofetch.create({
    baseURL,
    retry,
    timeout,
    onRequest: attachAuth,
    onResponseError: handleResponseError,
  });

  /**
   * Fetches a binary response (e.g. a PDF blob) WITH authentication.
   * ofetch's generics do not support `responseType: "blob"` together with
   * `ApiFetchOptions<R>`, so the call is cast at the boundary.
   */
  async function apiBlob<T = Blob>(
    path: string,
    requestOptions: ApiFetchOptions = {},
  ): Promise<T> {
    return (await ofetch<T, "blob">(path, {
      baseURL,
      retry,
      timeout,
      ...requestOptions,
      responseType: "blob",
      headers: requestOptions.headers,
      onRequest: attachAuth,
      onResponseError: handleResponseError,
    } as unknown as FetchOptions<"blob">)) as unknown as T;
  }

  return { api, apiBlob };
}

export type ApiClient = ReturnType<typeof createApiClient>;

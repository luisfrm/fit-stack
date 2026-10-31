import { RouterContextProvider, createRequestHandler } from "react-router";
import { cloudflareContext } from "../app/lib/cloudflare";
import { proxyApiRequest } from "../app/lib/api/server";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // The browser only ever talks to this Worker: `/api/*` is proxied to the
    // api-worker before React Router sees the request, so every app call stays
    // same-origin (cookies and CSRF behaviour match the panel's).
    if (url.pathname.startsWith("/api/")) {
      return proxyApiRequest(env, request);
    }

    // Bindings travel through a typed request context (React Router v8 API).
    const context = new RouterContextProvider();
    context.set(cloudflareContext, { env, ctx });

    return requestHandler(request, context);
  },
} satisfies ExportedHandler<Env>;

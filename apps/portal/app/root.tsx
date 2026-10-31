import type { ReactNode } from "react";
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

// The design system's Tailwind entry (tokens + `@theme`), shared with the panel
// and the console. `@workspace/ui` stays framework-agnostic since P1a (RD-170).
import "@workspace/ui/globals.css";

import type { Route } from "./+types/root";

export function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Error";
  let details = "Ocurrió un error inesperado.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : `Error ${error.status}`;
    details = error.status === 404 ? "La página solicitada no existe." : error.statusText;
  } else if (import.meta.env.DEV && error instanceof Error) {
    // Surface the real failure while developing: a broken API transport must
    // never look like an empty page.
    details = error.message;
    stack = error.stack;
  }

  return (
    <main>
      <h1>{message}</h1>
      <p>{details}</p>
      {stack ? (
        <pre>
          <code>{stack}</code>
        </pre>
      ) : null}
    </main>
  );
}

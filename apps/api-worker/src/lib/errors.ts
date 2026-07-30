import type { ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { APIError } from 'better-auth/api';
import { ZodError } from 'zod';
import type { AppEnv } from './env';

const KNOWN_STATUS_CODES = new Set([
  400, 401, 403, 404, 405, 409, 410, 422, 429, 500, 502, 503,
]);

function toStatusCode(n: number): ContentfulStatusCode {
  return (KNOWN_STATUS_CODES.has(n) ? n : 500) as ContentfulStatusCode;
}

/**
 * Global error handler for Hono application.
 * Formats errors into a unified response envelope: { error: string, details?: unknown }
 */
export const onError: ErrorHandler<AppEnv> = (err, c) => {
  if (err instanceof ZodError) {
    return c.json(
      { error: 'Validación fallida', details: err.issues },
      400,
    );
  }

  if (err instanceof APIError) {
    return c.json(
      { error: err.message, details: err.body },
      toStatusCode(err.statusCode),
    );
  }

  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }

  console.error('Unhandled server error details:', {
    message: err.message,
    name: err.name,
    stack: err.stack,
    cause: err.cause,
  });
  return c.json({ error: `Error interno del servidor: ${err.message}` }, 500);
};

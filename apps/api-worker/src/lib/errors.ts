import type { ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { APIError } from 'better-auth/api';
import { ZodError } from 'zod';
import { API_ERROR_CODES } from '@workspace/shared';
import type { AppEnv } from './env';
import { ReceiptError } from '../services/receipts.service';
import { VOID_REASON_REQUIRED_MESSAGE } from './schemas';

const KNOWN_STATUS_CODES = new Set([
  400, 401, 403, 404, 405, 409, 410, 422, 429, 500, 502, 503,
]);

function toStatusCode(n: number): ContentfulStatusCode {
  return (KNOWN_STATUS_CODES.has(n) ? n : 500) as ContentfulStatusCode;
}

/**
 * Extracts the deep `cause` of an error (Node.js chains causes
 * via `AggregateError` or errors with their own `cause`).
 */
function getDeepCause(err: unknown, depth = 0): unknown {
  if (depth > 5) return null;
  if (err && typeof err === 'object' && 'cause' in err) {
    return getDeepCause((err as { cause: unknown }).cause, depth + 1);
  }
  return err;
}

/**
 * Drizzle wraps Neon/Postgres errors in `DrizzleQueryError` with a
 * `cause` containing the SQLSTATE (`code`), `detail`, `hint`, etc.
 * Those properties are the real root cause and much more useful than
 * Drizzle's `message` (which is "Failed query: <sql>" + params, huge and truncated in UI).
 *
 * We only classify as a DB error when the cause appears to come from
 * Postgres — SQLSTATE (`code` 5 alphanumeric chars) or a known error class name.
 * Otherwise, it is not treated as a DB error.
 */
function unwrapDbError(err: unknown): {
  code?: string;
  detail?: string;
  hint?: string;
  message?: string;
} | null {
  const cause = getDeepCause(err);
  if (!cause || typeof cause !== 'object') return null;
  const e = cause as Record<string, unknown>;
  const code = typeof e.code === 'string' ? e.code : undefined;
  const detail = typeof e.detail === 'string' ? e.detail : undefined;
  const hint = typeof e.hint === 'string' ? e.hint : undefined;
  const message = typeof e.message === 'string' ? e.message : undefined;
  const name = typeof e.name === 'string' ? e.name : undefined;
  // Postgres SQLSTATE: 5 alphanumeric characters (e.g., 22000, 23505, 42P01).
  const looksLikeSqlState = !!code && /^[0-9A-Z]{5}$/.test(code);
  const knownDbName =
    name === 'NeonDbError' || name === 'DrizzleQueryError' || name === 'PostgresError';
  if (!looksLikeSqlState && !knownDbName) return null;
  return { code, detail, hint, message };
}

/**
 * True when the error (or its deep cause) is a Postgres FOREIGN KEY violation
 * (SQLSTATE `23503`). Pass `constraint` to narrow it to one constraint name;
 * Postgres truncates identifiers to 63 chars, so the check is a `includes`.
 *
 * Used by write paths whose DB-level `RESTRICT` FK is the source of truth: the
 * app-level pre-check has a TOCTOU window, so the constraint violation is
 * translated to the same business error instead of leaking as a 500.
 */
export function isPostgresForeignKeyViolation(
  err: unknown,
  constraint?: string,
): boolean {
  const cause = getDeepCause(err);
  if (!cause || typeof cause !== 'object') return false;
  const e = cause as Record<string, unknown>;
  if (e.code !== '23503') return false;
  if (!constraint) return true;
  const name = typeof e.constraint === 'string' ? e.constraint : '';
  return name.includes(constraint);
}

/**
 * RD-163 business error: a `voided` decision must explain itself. Single
 * definition for both services (the route schema is the first guard; this is
 * the backstop for any other entry point), so the `code` the UIs resolve is
 * built once — the same one the `zValidator` hook answers.
 */
export function voidReasonRequiredError(): HTTPException {
  return new HTTPException(400, {
    message: VOID_REASON_REQUIRED_MESSAGE,
    res: new Response(
      JSON.stringify({
        error: VOID_REASON_REQUIRED_MESSAGE,
        code: API_ERROR_CODES.VOID_REASON_REQUIRED,
        fields: ['voidReason'],
      }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    ),
  });
}

/**
 * Resolves the operator's void reason or throws `400 VOID_REASON_REQUIRED`.
 * Blank (absent, empty or padding) is never a reason: the server stores no
 * invented default and seals the receipt with the operator's own text.
 */
export function requireVoidReasonOrThrow(rawVoidReason: string | undefined): string {
  const reason = rawVoidReason?.trim();
  if (!reason) throw voidReasonRequiredError();
  return reason;
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
    // An HTTPException can contain its own Response (body with business code:
    // 409 { code: 'SLUG_TAKEN' }, 403 { code: 'FEATURE_NOT_AVAILABLE' }).
    // It is preserved AS-IS: the `code` is a client contract (toasts are resolved
    // by code, never text). Ignoring it would wipe it from the body.
    if (err.res) {
      return err.getResponse();
    }
    return c.json({ error: err.message }, err.status);
  }

  // Business errors from receipts: explicit error code for the client.
  if (err instanceof ReceiptError) {
    return c.json({ error: err.message, code: err.code }, err.status);
  }

  const dbError = unwrapDbError(err);
  console.error('Unhandled server error details:', {
    message: err.message,
    name: err.name,
    stack: err.stack,
    cause: err.cause,
    dbError,
  });

  if (dbError) {
    return c.json(
      {
        error: `Error interno del servidor: ${dbError.code ?? 'DB_ERROR'}: ${
          dbError.detail ?? dbError.message ?? err.message
        }`,
        details: { code: dbError.code, hint: dbError.hint },
      },
      500,
    );
  }

  return c.json({ error: `Error interno del servidor: ${err.message}` }, 500);
};

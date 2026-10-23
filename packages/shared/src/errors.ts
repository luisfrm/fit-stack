/**
 * Frontend error helpers shared by the Panel and the Console.
 *
 * Global rule (AGENTS.md §7): raw API messages are NEVER shown in a toast.
 * The toast always uses a generic, actionable message for the action that
 * failed; the API message is only logged. The ONE exception is a business
 * error reported by `code` (`apiCode`), never by server text.
 */

/**
 * Stable API business codes (`err.data.code`) that a screen resolves to its
 * own message. Registered here so both apps compare the CODE, never the text.
 */
export const API_ERROR_CODES = {
  /**
   * `PATCH /payments/:id/status` and its Console mirror: the requested status
   * is not a legal transition (`400`). Only `validated` and `voided` are
   * accepted targets; `processing` is a creation status.
   */
  PAYMENT_STATUS_TRANSITION_INVALID: "PAYMENT_STATUS_TRANSITION_INVALID",
  /**
   * `POST /subscriptions`: the requested `currencyPaid` is outside the
   * organization's `active_currencies` (`400`). The server prices the payment,
   * so only currencies the org can actually charge in are accepted.
   */
  PAYMENT_CURRENCY_NOT_ACTIVE: "PAYMENT_CURRENCY_NOT_ACTIVE",
  /**
   * `PATCH /payments/:id/status` and its Console mirror: a `voided` decision
   * carries no reason (`400`). An annulment/rejection must explain itself — the
   * server never invents a default like "Pago anulado".
   */
  VOID_REASON_REQUIRED: "VOID_REASON_REQUIRED",
  /**
   * `POST /platform/subscriptions` (and its org-scoped mirror): trials are
   * discontinued (`400`). A historical trial booked a `$0` payment while
   * snapshotting the full plan price, which inflated SaaS revenue; future
   * discounts are handled with coupons.
   */
  TRIAL_NOT_AVAILABLE: "TRIAL_NOT_AVAILABLE",
} as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];

/**
 * Maps known schema field keys to user-friendly Spanish labels.
 * Unknown keys fall back to the field name itself.
 */
const FIELD_LABEL_MAP: Record<string, string> = {
  name: "Nombre",
  description: "Descripción",
  trainerName: "Entrenador",
  startTime: "Hora de inicio",
  endTime: "Hora de fin",
  capacity: "Capacidad",
  daysOfWeek: "Días de la semana",
  scheduledDate: "Fecha programada",
  frequencyType: "Tipo de frecuencia",
  email: "Correo electrónico",
  password: "Contraseña",
  firstName: "Nombre",
  lastName: "Apellido",
  phoneNumber: "Teléfono",
  documentId: "Documento de identidad",
};

/** Shape of a single Zod / API validation issue (only the fields we read). */
interface ApiIssue {
  readonly message?: string;
  readonly code?: string;
  readonly received?: string;
  readonly path?: readonly unknown[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function describeIssue(issue: ApiIssue): string {
  const message = issue.message ?? "";
  if (message && message !== "Required" && !message.startsWith("invalid_")) {
    return message;
  }

  const pathKey =
    Array.isArray(issue.path) && issue.path.length > 0
      ? String(issue.path[0])
      : "";
  const label = FIELD_LABEL_MAP[pathKey] || pathKey || "Campo";

  if (issue.code === "invalid_type" && issue.received === "undefined") {
    return `El campo "${label}" es requerido.`;
  }
  if (message === "Required") {
    return `El campo "${label}" es requerido.`;
  }
  return `El campo "${label}" tiene un valor inválido.`;
}

/**
 * Formats Zod issues or API errors into a human-readable Spanish string.
 *
 * Used by the HTTP client to replace a raw validation payload with a string
 * before it reaches a React component (which would otherwise crash while
 * rendering an object as a child).
 */
export function formatApiErrorMessage(data: unknown): string | null {
  if (!isRecord(data)) return null;

  const rawError = isRecord(data.error) ? data.error : data;
  const issues = Array.isArray(rawError.issues)
    ? (rawError.issues as ApiIssue[])
    : Array.isArray(data.issues)
      ? (data.issues as ApiIssue[])
      : null;

  if (issues && issues.length > 0) {
    return issues.map(describeIssue).join(" ");
  }

  if (typeof rawError.message === "string" && rawError.message.trim()) {
    return rawError.message;
  }

  if (typeof data.error === "string" && data.error.trim()) {
    return data.error;
  }

  if (typeof data.message === "string" && data.message.trim()) {
    return data.message;
  }

  return null;
}

/**
 * Returns the toast message for a failed mutation: logs the real error and
 * returns the generic, actionable fallback for the screen.
 *
 * Usage:
 *   catch (err) {
 *     toast.error(mutationError('OrgRenewalModal', err, 'No se pudo registrar el pago'));
 *   }
 */
export function mutationError(
  scope: string,
  err: unknown,
  fallback: string,
): string {
  console.error(`[${scope}]`, err);
  return fallback;
}

/**
 * Business code of an API error (`err.data.code`). The only permitted way to
 * show a specific message is comparing the CODE, never the server text.
 */
export function apiCode(err: unknown): string | undefined {
  if (!isRecord(err)) return undefined;
  const data = isRecord(err.data) ? err.data : null;
  return typeof data?.code === "string" ? data.code : undefined;
}

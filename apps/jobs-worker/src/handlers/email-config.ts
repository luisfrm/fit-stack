/**
 * Email transport configuration resolution (pure: no SDK imports, no I/O).
 *
 * Enforces the repo's "no silent fallbacks" rule (§10): every missing or
 * unknown configuration value throws an error that NAMES the offending
 * variable, so a misconfigured deployment fails visibly instead of quietly
 * sending through a hardcoded default (e.g. a sandbox sender).
 *
 * Resolution is LAZY: `resolveEmailTransport` / `resolveInviteBaseUrl` are
 * called only at the moment an email is sent. The render-only path (building
 * the PDF) never resolves email config, so a missing provider does not break
 * receipt rendering.
 */

/** Raw email-related bindings as they arrive from the Worker `env`. */
export interface EmailConfigEnv {
  EMAIL_PROVIDER?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  PANEL_URL?: string;
  CONSOLE_URL?: string;
}

/** Resolved transport discriminated union. */
export type EmailTransport =
  | { provider: 'resend'; apiKey: string; from: string }
  | { provider: 'gmail'; smtpUser: string; smtpPass: string };

/**
 * Trims `value` and fails visibly when it is empty, naming the variable and
 * the resolution context so the error is actionable.
 */
function requiredVar(name: string, value: string | undefined, context: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`Missing required env var ${name} ${context}.`);
  }
  return trimmed;
}

/**
 * Resolves the email transport from `EMAIL_PROVIDER` (expected `'resend'` or
 * `'gmail'`). Throws — naming the missing variable and the provider context —
 * when the provider is unset/blank, unknown, or when the credentials required
 * for the selected provider are absent.
 */
export function resolveEmailTransport(env: EmailConfigEnv): EmailTransport {
  const provider = env.EMAIL_PROVIDER?.trim();
  if (!provider) {
    throw new Error("Missing required env var EMAIL_PROVIDER (expected 'resend' or 'gmail').");
  }

  switch (provider) {
    case 'resend':
      return {
        provider: 'resend',
        apiKey: requiredVar('RESEND_API_KEY', env.RESEND_API_KEY, '(EMAIL_PROVIDER=resend)'),
        from: requiredVar('RESEND_FROM_EMAIL', env.RESEND_FROM_EMAIL, '(EMAIL_PROVIDER=resend)'),
      };
    case 'gmail':
      return {
        provider: 'gmail',
        smtpUser: requiredVar('SMTP_USER', env.SMTP_USER, '(EMAIL_PROVIDER=gmail)'),
        smtpPass: requiredVar('SMTP_PASS', env.SMTP_PASS, '(EMAIL_PROVIDER=gmail)'),
      };
    default:
      throw new Error(
        `Invalid EMAIL_PROVIDER value "${provider}" (expected 'resend' or 'gmail').`,
      );
  }
}

/**
 * Resolves the base URL used to build registration invite links for the given
 * target. Throws — naming the missing variable — instead of falling back to a
 * hardcoded localhost URL.
 */
export function resolveInviteBaseUrl(env: EmailConfigEnv, target: 'panel' | 'console'): string {
  return target === 'console'
    ? requiredVar('CONSOLE_URL', env.CONSOLE_URL, '(registration invite target=console)')
    : requiredVar('PANEL_URL', env.PANEL_URL, '(registration invite target=panel)');
}

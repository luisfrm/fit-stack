/**
 * Pure config resolution for the email transport (`resolveEmailTransport`) and
 * registration invite base URLs (`resolveInviteBaseUrl`).
 *
 * Covers the visible-failure contract (§10): every missing/unknown value
 * throws an error that NAMES the offending variable, and no hardcoded
 * fallback sender/URL ever appears.
 */
import { describe, expect, it } from 'vitest';
import {
  resolveEmailTransport,
  resolveInviteBaseUrl,
  type EmailConfigEnv,
} from '../src/handlers/email-config';

describe('resolveEmailTransport', () => {
  it('throws when EMAIL_PROVIDER is absent, naming the variable', () => {
    expect(() => resolveEmailTransport({})).toThrow(
      "Missing required env var EMAIL_PROVIDER (expected 'resend' or 'gmail').",
    );
  });

  it('throws when EMAIL_PROVIDER is blank, naming the variable', () => {
    expect(() => resolveEmailTransport({ EMAIL_PROVIDER: '   ' })).toThrow(
      "Missing required env var EMAIL_PROVIDER (expected 'resend' or 'gmail').",
    );
  });

  it('throws on an unknown provider value "foo", quoting it', () => {
    expect(() => resolveEmailTransport({ EMAIL_PROVIDER: 'foo' })).toThrow(
      'Invalid EMAIL_PROVIDER value "foo" (expected \'resend\' or \'gmail\').',
    );
  });

  it('throws on the unknown provider value "smtp"', () => {
    expect(() => resolveEmailTransport({ EMAIL_PROVIDER: 'smtp' })).toThrow(
      'Invalid EMAIL_PROVIDER value "smtp" (expected \'resend\' or \'gmail\').',
    );
  });

  it('throws when resend is selected without RESEND_API_KEY', () => {
    const env: EmailConfigEnv = { EMAIL_PROVIDER: 'resend', RESEND_FROM_EMAIL: 'a@b.com' };
    expect(() => resolveEmailTransport(env)).toThrow(
      'Missing required env var RESEND_API_KEY (EMAIL_PROVIDER=resend).',
    );
  });

  it('throws when resend is selected without RESEND_FROM_EMAIL (no sandbox fallback)', () => {
    const env: EmailConfigEnv = { EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'key-123' };
    expect(() => resolveEmailTransport(env)).toThrow(
      'Missing required env var RESEND_FROM_EMAIL (EMAIL_PROVIDER=resend).',
    );
  });

  it('never leaks the resend.dev sandbox sender', () => {
    let message = '';
    try {
      resolveEmailTransport({ EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'key-123' });
      throw new Error('resolveEmailTransport should have thrown for a missing RESEND_FROM_EMAIL');
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toBe('Missing required env var RESEND_FROM_EMAIL (EMAIL_PROVIDER=resend).');
    expect(message).not.toContain('onboarding@resend.dev');
  });

  it('throws when gmail is selected without SMTP_USER', () => {
    const env: EmailConfigEnv = { EMAIL_PROVIDER: 'gmail', SMTP_PASS: 'pass' };
    expect(() => resolveEmailTransport(env)).toThrow(
      'Missing required env var SMTP_USER (EMAIL_PROVIDER=gmail).',
    );
  });

  it('throws when gmail is selected without SMTP_PASS', () => {
    const env: EmailConfigEnv = { EMAIL_PROVIDER: 'gmail', SMTP_USER: 'user@gmail.com' };
    expect(() => resolveEmailTransport(env)).toThrow(
      'Missing required env var SMTP_PASS (EMAIL_PROVIDER=gmail).',
    );
  });

  it('resolves a complete resend config, trimming whitespace', () => {
    expect(
      resolveEmailTransport({
        EMAIL_PROVIDER: '  resend  ',
        RESEND_API_KEY: '  key-123  ',
        RESEND_FROM_EMAIL: '  sender@example.com  ',
      }),
    ).toEqual({ provider: 'resend', apiKey: 'key-123', from: 'sender@example.com' });
  });

  it('resolves a complete gmail config, trimming whitespace', () => {
    expect(
      resolveEmailTransport({
        EMAIL_PROVIDER: 'gmail',
        SMTP_USER: '  user@gmail.com  ',
        SMTP_PASS: '  pass-123  ',
      }),
    ).toEqual({ provider: 'gmail', smtpUser: 'user@gmail.com', smtpPass: 'pass-123' });
  });
});

describe('resolveInviteBaseUrl', () => {
  it('returns the trimmed PANEL_URL for the panel target', () => {
    expect(resolveInviteBaseUrl({ PANEL_URL: '  http://localhost:3001  ' }, 'panel')).toBe(
      'http://localhost:3001',
    );
  });

  it('returns the trimmed CONSOLE_URL for the console target', () => {
    expect(resolveInviteBaseUrl({ CONSOLE_URL: '  http://localhost:3000  ' }, 'console')).toBe(
      'http://localhost:3000',
    );
  });

  it('throws when PANEL_URL is missing, naming the variable and context', () => {
    expect(() => resolveInviteBaseUrl({}, 'panel')).toThrow(
      'Missing required env var PANEL_URL (registration invite target=panel).',
    );
  });

  it('throws when CONSOLE_URL is missing, naming the variable and context', () => {
    expect(() => resolveInviteBaseUrl({}, 'console')).toThrow(
      'Missing required env var CONSOLE_URL (registration invite target=console).',
    );
  });
});

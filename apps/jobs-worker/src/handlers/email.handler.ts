import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { renderRegistrationInvite } from '../templates/send-invitation';
import { renderOrgInvite } from '../templates/org-invite';
import {
  resolveEmailTransport,
  resolveInviteBaseUrl,
  type EmailConfigEnv,
} from './email-config';

export interface EmailAttachment {
  filename: string;
  content: Buffer | Uint8Array;
  contentType?: string;
}

/**
 * Exhaustiveness guard for the email transport union: a value reaching this
 * helper means a new provider member was added without a matching `case`, and
 * TypeScript fails the build instead of silently dropping the send.
 */
function assertNever(value: never): never {
  const provider = (value as { provider?: string }).provider;
  throw new Error(`Unsupported email provider: ${provider ?? String(value)}`);
}

/**
 * Email transport (Resend / Gmail SMTP). HTML is composed by
 * templates in `src/templates/` — this handler ONLY sends emails.
 *
 * The transport is resolved lazily from `env` on every send via
 * `resolveEmailTransport`: a missing or unknown provider/credential throws a
 * visible error naming the variable (no silent fallback — §10).
 */
export async function sendEmail(
  env: EmailConfigEnv,
  options: { to: string; subject: string; html: string; attachments?: EmailAttachment[] }
) {
  const transport = resolveEmailTransport(env);

  switch (transport.provider) {
    case 'resend': {
      const resend = new Resend(transport.apiKey);
      await resend.emails.send({
        from: transport.from,
        to: options.to,
        subject: options.subject,
        html: options.html,
        attachments: options.attachments?.map((a) => ({
          filename: a.filename,
          content: Buffer.from(a.content),
          contentType: a.contentType ?? 'application/pdf',
        })),
      });
      console.log(`✉️ [RESEND] Email enviado a ${options.to}`);
      return true;
    }
    case 'gmail': {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: transport.smtpUser,
          pass: transport.smtpPass,
        },
      });

      await transporter.sendMail({
        from: `"Fit-Stack" <${transport.smtpUser}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
        attachments: options.attachments?.map((a) => ({
          filename: a.filename,
          content: Buffer.from(a.content),
          contentType: a.contentType ?? 'application/pdf',
        })),
      });
      console.log(`✉️ [GMAIL SMTP] Email enviado a ${options.to}`);
      return true;
    }
    default:
      return assertNever(transport);
  }
}

export async function handleRegistrationInvite(
  env: EmailConfigEnv,
  payload: { email: string; token: string; target?: 'panel' | 'console'; role?: string }
) {
  const target = payload.target === 'console' ? 'console' : 'panel';
  const baseUrl = resolveInviteBaseUrl(env, target);

  const { subject, html } = renderRegistrationInvite({
    email: payload.email,
    token: payload.token,
    target,
    role: payload.role,
    baseUrl,
  });

  return sendEmail(env, { to: payload.email, subject, html });
}

export async function handleOrgInvite(
  env: EmailConfigEnv,
  payload: { email: string; orgName: string; inviterName: string; inviteLink: string }
) {
  const { subject, html } = renderOrgInvite(payload);

  return sendEmail(env, { to: payload.email, subject, html });
}

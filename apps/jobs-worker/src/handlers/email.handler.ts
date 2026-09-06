import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { renderRegistrationInvite } from '../templates/send-invitation';
import { renderOrgInvite } from '../templates/org-invite';

export interface EmailHandlerEnv {
  EMAIL_PROVIDER?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  PANEL_URL?: string;
  CONSOLE_URL?: string;
}

/**
 * Transporte de email (Resend / Gmail SMTP). El HTML lo componen los
 * templates en `src/templates/` — este handler SOLO envía.
 */
export async function sendEmail(
  env: EmailHandlerEnv,
  options: { to: string; subject: string; html: string; attachments?: Array<{ filename: string; content: Buffer | Uint8Array }> }
) {
  const provider = env.EMAIL_PROVIDER || 'gmail';

  if (provider === 'resend' && env.RESEND_API_KEY) {
    const resend = new Resend(env.RESEND_API_KEY);
    await resend.emails.send({
      from: env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
      to: options.to,
      subject: options.subject,
      html: options.html,
      attachments: options.attachments?.map((a) => ({
        filename: a.filename,
        content: Buffer.from(a.content),
      })),
    });
    console.log(`✉️ [RESEND] Email enviado a ${options.to}`);
    return true;
  }

  if (provider === 'gmail' && env.SMTP_USER && env.SMTP_PASS) {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: `"Fit-Stack" <${env.SMTP_USER}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      attachments: options.attachments?.map((a) => ({
        filename: a.filename,
        content: Buffer.from(a.content),
      })),
    });
    console.log(`✉️ [GMAIL SMTP] Email enviado a ${options.to}`);
    return true;
  }

  throw new Error(`Configuración de email incompleta para el proveedor: ${provider}`);
}

export async function handleRegistrationInvite(
  env: EmailHandlerEnv,
  payload: { email: string; token: string; target?: 'panel' | 'console'; role?: string }
) {
  const target = payload.target === 'console' ? 'console' : 'panel';
  const baseUrl =
    target === 'console'
      ? env.CONSOLE_URL || 'http://localhost:3003'
      : env.PANEL_URL || 'http://localhost:3001';

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
  env: EmailHandlerEnv,
  payload: { email: string; orgName: string; inviterName: string; inviteLink: string }
) {
  const { subject, html } = renderOrgInvite(payload);

  return sendEmail(env, { to: payload.email, subject, html });
}

/**
 * Transport selection in `sendEmail` / `handleRegistrationInvite` with the
 * Resend and nodemailer SDKs mocked:
 * - resend → constructs `Resend` with the resolved key and sends with the
 *   resolved `from` (never the resend.dev sandbox sender).
 * - gmail → `createTransport({ service: 'gmail', auth })` and sends from
 *   `"Fit-Stack" <SMTP_USER>`.
 * - missing config → rejects, naming the variable, without touching any SDK.
 * - registration invite without `PANEL_URL` → rejects, naming the variable.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const resendCtorMock = vi.hoisted(() => vi.fn());
const resendSendMock = vi.hoisted(() => vi.fn());
const createTransportMock = vi.hoisted(() => vi.fn());
const sendMailMock = vi.hoisted(() => vi.fn());

vi.mock('resend', () => ({
  Resend: resendCtorMock,
}));

vi.mock('nodemailer', () => ({
  default: { createTransport: createTransportMock },
}));

import { sendEmail, handleRegistrationInvite } from '../src/handlers/email.handler';

beforeEach(() => {
  resendCtorMock.mockReset().mockImplementation(() => ({ emails: { send: resendSendMock } }));
  resendSendMock.mockReset().mockResolvedValue({ id: 'sent' });
  createTransportMock.mockReset().mockReturnValue({ sendMail: sendMailMock });
  sendMailMock.mockReset().mockResolvedValue({ messageId: 'sent' });
});

describe('sendEmail transport selection', () => {
  it('sends through Resend with the key and resolved from (never the sandbox sender)', async () => {
    const result = await sendEmail(
      { EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'key-123', RESEND_FROM_EMAIL: 'sender@example.com' },
      { to: 'member@example.com', subject: 'Hi', html: '<p>Hi</p>' },
    );

    expect(result).toBe(true);
    expect(resendCtorMock).toHaveBeenCalledWith('key-123');
    expect(resendSendMock).toHaveBeenCalledTimes(1);
    const payload = resendSendMock.mock.calls[0][0] as { from: string; to: string };
    expect(payload.from).toBe('sender@example.com');
    expect(payload.from).not.toBe('onboarding@resend.dev');
    expect(payload.to).toBe('member@example.com');
    expect(createTransportMock).not.toHaveBeenCalled();
  });

  it('sends through Gmail SMTP with the resolved auth and "Fit-Stack" sender', async () => {
    const result = await sendEmail(
      { EMAIL_PROVIDER: 'gmail', SMTP_USER: 'user@gmail.com', SMTP_PASS: 'pass-123' },
      { to: 'member@example.com', subject: 'Hi', html: '<p>Hi</p>' },
    );

    expect(result).toBe(true);
    expect(createTransportMock).toHaveBeenCalledWith({
      service: 'gmail',
      auth: { user: 'user@gmail.com', pass: 'pass-123' },
    });
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const payload = sendMailMock.mock.calls[0][0] as { from: string; to: string };
    expect(payload.from).toBe('"Fit-Stack" <user@gmail.com>');
    expect(payload.to).toBe('member@example.com');
    expect(resendCtorMock).not.toHaveBeenCalled();
  });

  it('rejects when the provider config is absent and never touches an SDK', async () => {
    await expect(
      sendEmail({}, { to: 'member@example.com', subject: 'Hi', html: '<p>Hi</p>' }),
    ).rejects.toThrow('Missing required env var EMAIL_PROVIDER');

    expect(resendCtorMock).not.toHaveBeenCalled();
    expect(resendSendMock).not.toHaveBeenCalled();
    expect(createTransportMock).not.toHaveBeenCalled();
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('rejects a registration invite when PANEL_URL is absent, naming the variable', async () => {
    await expect(
      handleRegistrationInvite(
        { EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'key-123', RESEND_FROM_EMAIL: 'sender@example.com' },
        { email: 'invitee@example.com', token: 'tok-123' },
      ),
    ).rejects.toThrow('Missing required env var PANEL_URL (registration invite target=panel).');

    expect(resendSendMock).not.toHaveBeenCalled();
  });
});

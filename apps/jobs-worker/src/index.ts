import { handleRegistrationInvite, handleOrgInvite } from './handlers/email.handler';
import { handlePaymentReceipt } from './handlers/pdf.handler';

export type FitTaskEvent =
  | {
      type: 'email.registration_invite';
      email: string;
      token: string;
      /** Which app the registration link must point to. Defaults to 'panel'. */
      target?: 'panel' | 'console';
      /** Platform role to assign on sign-up (console invites only). */
      role?: string;
    }
  | { type: 'email.org_invite'; email: string; orgName: string; inviterName: string; inviteLink: string }
  | { type: 'email.payment_receipt'; paymentId: number; organizationId: string };

export interface Env {
  DATABASE_URL: string;
  EMAIL_PROVIDER?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  PANEL_URL?: string;
  CONSOLE_URL?: string;
}

export default {
  async queue(batch: MessageBatch<FitTaskEvent>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      try {
        const event = message.body;
        console.log(`Processing queue event: ${event.type}`);

        switch (event.type) {
          case 'email.registration_invite':
            await handleRegistrationInvite(env, event);
            break;
          case 'email.org_invite':
            await handleOrgInvite(env, event);
            break;
          case 'email.payment_receipt':
            await handlePaymentReceipt(env, event);
            break;
          default:
            console.warn(`Unknown queue event type: ${(event as any).type}`);
        }

        message.ack();
      } catch (error) {
        console.error(`Failed to process message ${message.id}:`, error);
        message.retry();
      }
    }
  },
};

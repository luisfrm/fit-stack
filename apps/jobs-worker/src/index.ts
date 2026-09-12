import { handleRegistrationInvite, handleOrgInvite } from './handlers/email.handler';
import { handlePaymentReceipt, handleOrgPaymentReceived } from './handlers/pdf.handler';
import { handleReceiptRender, sweepPendingReceiptPdfs } from './handlers/receipt.handler';
import type { ReceiptRenderEvent } from '@workspace/shared';

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
  | { type: 'email.payment_receipt'; paymentId: number; organizationId: string }
  | {
      type: 'email.org_payment_received';
      paymentId: number;
      organizationId: string;
      /** Usuario que registró el pago (sesión). Recibe confirmación + owners dedupe. */
      payerEmail: string;
      payerName: string;
    };

export interface Env {
  DATABASE_URL: string;
  EMAIL_PROVIDER?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  PANEL_URL?: string;
  CONSOLE_URL?: string;
  FILES_BUCKET: R2Bucket;
  /** Producer de fit-task-events (el paso 2 encola aquí el email gateado). */
  TASK_QUEUE: Queue;
  /** Producer de fit-receipt-events (solo el barrido re-encola). */
  RECEIPT_QUEUE: Queue;
}

export default {
  async queue(
    batch: MessageBatch<FitTaskEvent | ReceiptRenderEvent>,
    env: Env,
  ): Promise<void> {
    // fit-receipt-events tiene su propio consumer path (una cola = un consumer;
    // este worker consume DOS colas distintas). Se ramifica por nombre de cola,
    // no por tipo de evento.
    if (batch.queue.startsWith('fit-receipt-events')) {
      for (const message of batch.messages) {
        try {
          await handleReceiptRender(env, message.body as ReceiptRenderEvent);
          message.ack();
        } catch (error) {
          console.error(`Failed to render receipt ${message.id}:`, error);
          message.retry();
        }
      }
      return;
    }
    for (const message of batch.messages) {
      try {
        const event = message.body as FitTaskEvent;
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
          case 'email.org_payment_received':
            await handleOrgPaymentReceived(env, event);
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

  /**
   * Barrido cada 10 min (cron en wrangler.jsonc): re-encola renders de
   * pagos numerados sin PDF. Cierra el hueco "número asignado pero evento
   * nunca llegó a la cola". Idempotente con el paso 2.
   */
  async scheduled(
    _event: ScheduledEvent,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    const { requeued } = await sweepPendingReceiptPdfs(env);
    if (requeued > 0) {
      console.log(`receipt sweep: ${requeued} renders re-encolados.`);
    }
  },
};

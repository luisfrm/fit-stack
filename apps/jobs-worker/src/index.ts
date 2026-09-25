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
  | {
      type: 'email.payment_receipt';
      paymentId: number;
      organizationId: string;
      /**
       * Número correlativo (hint de display; la verdad vive en DB).
       * Opcional = compat con eventos en vuelo sin el campo.
       */
      receiptNumber?: string;
    }
  | {
      type: 'email.org_payment_received';
      paymentId: number;
      organizationId: string;
      /** Usuario que registró el pago (sesión). Recibe confirmación + owners dedupe. */
      payerEmail?: string;
      payerName?: string;
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
    // Log every batch entry so the pipeline is always traceable.
    console.log(`[jobs-worker] queue() triggered — queue="${batch.queue}" messages=${batch.messages.length}`);

    // fit-receipt-events has its own consumer path (one queue = one consumer;
    // this worker consumes TWO distinct queues). Branches by queue name,
    // not by event type.
    if (batch.queue.startsWith('fit-receipt-events')) {
      console.log(`[jobs-worker] receipt render batch — ${batch.messages.length} message(s)`);
      for (const message of batch.messages) {
        const event = message.body as ReceiptRenderEvent;
        console.log(
          `[jobs-worker] receipt.render — paymentId=${event.paymentId} scope=${event.scope} receiptNumber=${event.receiptNumber} attempt=${message.attempts}`,
        );
        try {
          const outcome = await handleReceiptRender(env, event);
          console.log(`[jobs-worker] receipt.render — outcome="${outcome}" paymentId=${event.paymentId}`);
          message.ack();
        } catch (error) {
          // Never emit an empty error: name, message and cause travel in the
          // log so the failure is actionable (FS-0004). No semantic change:
          // exhausted retries still go to the DLQ.
          const cause = error instanceof Error ? error.cause : undefined;
          const name = error instanceof Error ? error.name : 'UnknownError';
          const messageText =
            error instanceof Error ? error.message : String(error);
          console.error(`[jobs-worker] receipt.render FAILED — paymentId=${event.paymentId} attempt=${message.attempts}`, {
            name,
            message: messageText,
            cause,
          });
          message.retry();
        }
      }
      return;
    }

    // fit-task-events: email events routed by type.
    console.log(`[jobs-worker] task event batch — ${batch.messages.length} message(s)`);
    for (const message of batch.messages) {
      const event = message.body as FitTaskEvent;
      console.log(`[jobs-worker] processing task event type="${event.type}" attempt=${message.attempts}`);
      try {
        switch (event.type) {
          case 'email.registration_invite':
            await handleRegistrationInvite(env, event);
            break;
          case 'email.org_invite':
            await handleOrgInvite(env, event);
            break;
          case 'email.payment_receipt':
            console.log(
              `[jobs-worker] email.payment_receipt — paymentId=${event.paymentId} org=${event.organizationId}`,
            );
            await handlePaymentReceipt(env, event);
            break;
          case 'email.org_payment_received':
            console.log(
              `[jobs-worker] email.org_payment_received — paymentId=${event.paymentId} org=${event.organizationId}`,
            );
            await handleOrgPaymentReceived(env, event);
            break;
          default:
            console.warn(`[jobs-worker] unknown event type: ${(event as any).type}`);
        }

        console.log(`[jobs-worker] task event done — type="${event.type}"`);
        message.ack();
      } catch (error) {
        console.error(`[jobs-worker] task event FAILED — type="${(event as any).type}" attempt=${message.attempts}:`, error);
        message.retry();
      }
    }
  },

  /**
   * Sweep (cron in Terraform, pre-sale every 10h): re-queues renders for
   * numbered payments without a PDF. Closes the gap "number assigned but
   * event never reached the queue". Idempotent with step 2.
   */
  async scheduled(
    _event: ScheduledEvent,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    console.log('[jobs-worker] scheduled sweep starting...');
    const { requeued } = await sweepPendingReceiptPdfs(env);
    if (requeued > 0) {
      console.log(`[jobs-worker] receipt sweep: ${requeued} render(s) re-queued.`);
    } else {
      console.log('[jobs-worker] receipt sweep: nothing pending.');
    }
  },
};

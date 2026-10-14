import { handleRegistrationInvite, handleOrgInvite } from './handlers/email.handler';
import { type EmailConfigEnv } from './handlers/email-config';
import { handlePaymentReceipt, handleOrgPaymentReceived } from './handlers/pdf.handler';
import { handleReceiptRender, sweepPendingReceiptPdfs } from './handlers/receipt.handler';
import { clearReceiptNotifiedMarkForEvent } from './handlers/notify-mark';
import {
  isFinalDeliveryAttempt,
  TASK_QUEUE_MAX_RETRIES,
  isFitTaskEvent,
  type FitTaskEvent,
  type ReceiptRenderEvent,
} from '@workspace/shared';

export interface Env extends EmailConfigEnv {
  DATABASE_URL: string;
  FILES_BUCKET: R2Bucket;
  /** Producer for fit-task-events (step 2 enqueues gated emails here). */
  TASK_QUEUE: Queue;
  /** Producer for fit-receipt-events (sweep re-enqueues here). */
  RECEIPT_QUEUE: Queue;
}

/**
 * Processes a single batch of receipt render events from fit-receipt-events.
 * Acks on success, retries on failure with a structured error log.
 */
async function processReceiptBatch(
  batch: MessageBatch<ReceiptRenderEvent>,
  env: Env,
): Promise<void> {
  console.log(`[jobs-worker] receipt render batch — ${batch.messages.length} message(s)`);
  for (const message of batch.messages) {
    const event = message.body;
    console.log(
      `[jobs-worker] receipt.render — paymentId=${event.paymentId} scope=${event.scope} receiptNumber=${event.receiptNumber} attempt=${message.attempts}`,
    );
    try {
      const outcome = await handleReceiptRender(env, event);
      console.log(`[jobs-worker] receipt.render — outcome="${outcome}" paymentId=${event.paymentId}`);
      message.ack();
    } catch (error) {
      // Never emit an empty error: name, message and cause travel in the
      // log so the failure is actionable. No semantic change: exhausted
      // retries still go to the DLQ.
      const cause = error instanceof Error ? error.cause : undefined;
      const name = error instanceof Error ? error.name : 'UnknownError';
      const messageText = error instanceof Error ? error.message : String(error);
      console.error(`[jobs-worker] receipt.render FAILED — paymentId=${event.paymentId} attempt=${message.attempts}`, {
        name,
        message: messageText,
        cause,
      });
      message.retry();
    }
  }
}

/**
 * Processes a single batch of task events from fit-task-events.
 * Routes by event type, acks on success, retries on failure.
 *
 * A body that does not satisfy the shared `fitTaskEvent` contract is a poison
 * message (drifted producer): it is acked WITHOUT retry and logged with the
 * raw type — the default branch below is only defense-in-depth for a drift
 * between the guard and the switch.
 *
 * On the final failed delivery (the one that dead-letters the message), the
 * receipt notified mark is cleared first so the sweep's second predicate can
 * recover the payment — see `clearReceiptNotifiedMarkForEvent`.
 */
async function processTaskBatch(
  batch: MessageBatch<FitTaskEvent>,
  env: Env,
): Promise<void> {
  console.log(`[jobs-worker] task event batch — ${batch.messages.length} message(s)`);
  for (const message of batch.messages) {
    const event = message.body;
    if (!isFitTaskEvent(event)) {
      console.error(
        '[jobs-worker] unsupported task event — ack without retry (poison message; contract: @workspace/shared fit-task-events)',
        { rawType: (event as { type?: unknown }).type },
      );
      message.ack();
      continue;
    }
    const eventType: string = event.type;
    console.log(`[jobs-worker] processing task event type="${eventType}" attempt=${message.attempts}`);
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
          console.error(`[jobs-worker] unknown task event type: ${eventType}`);
      }
      console.log(`[jobs-worker] task event done — type="${event.type}"`);
      message.ack();
    } catch (error) {
      console.error(`[jobs-worker] task event FAILED — type="${event.type}" attempt=${message.attempts}:`, error);
      // Final failed delivery: the message is about to be dead-lettered.
      // Clear the receipt notified mark so the sweep can recover the payment
      // (best-effort; a cleanup failure never interrupts the retry below).
      if (isFinalDeliveryAttempt(message.attempts, TASK_QUEUE_MAX_RETRIES)) {
        await clearReceiptNotifiedMarkForEvent(env, event);
      }
      message.retry();
    }
  }
}

export default {
  async queue(
    batch: MessageBatch<FitTaskEvent | ReceiptRenderEvent>,
    env: Env,
  ): Promise<void> {
    // Log every batch entry so the pipeline is always traceable.
    console.log(`[jobs-worker] queue() triggered — queue="${batch.queue}" messages=${batch.messages.length}`);

    // fit-receipt-events has its own consumer path (one queue = one consumer;
    // this worker consumes TWO distinct queues). Branch by queue name, not event type.
    if (batch.queue.startsWith('fit-receipt-events')) {
      return processReceiptBatch(batch as MessageBatch<ReceiptRenderEvent>, env);
    }
    return processTaskBatch(batch as MessageBatch<FitTaskEvent>, env);
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

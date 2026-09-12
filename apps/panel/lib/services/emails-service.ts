import { api } from "@/lib/api/client";
import { receiptsService } from "./receipts-service";

/**
 * Service to handle all email-related operations.
 * Centralizes the communication with the backend email dispatchers.
 */
export const emailsService = {
  /**
   * Alias: el dueño del endpoint es `receiptsService` (Fase 3).
   * Firma intacta (`Promise<void>`) para no romper callers externos.
   */
  async sendReceiptByEmail(paymentId: number): Promise<void> {
    await receiptsService.sendReceiptEmail(paymentId);
  },

  async sendInvitationEmail(
    email: string,
    role: string,
    payload?: Record<string, unknown>,
  ): Promise<void> {
    await api("/emails/invite", {
      method: "POST",
      body: { email, role, ...payload },
    });
  },

  async sendRegistrationEmail(
    userId: string,
    payload?: Record<string, unknown>,
  ): Promise<void> {
    await api(`/emails/register/${userId}`, {
      method: "POST",
      body: payload,
    });
  },
};

import { api } from "@/lib/api/client";

/**
 * Service to handle all email-related operations.
 * Centralizes the communication with the backend email dispatchers.
 */
export const emailsService = {
  async sendReceiptByEmail(paymentId: number): Promise<void> {
    await api(`/payments/${paymentId}/send-email`, { method: "POST" });
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

import { apiClient } from "../api-client";

/**
 * Service to handle all email-related operations.
 * Centralizes the communication with the backend email dispatchers.
 */
export const emailsService = {
  /**
   * Triggers the sending of a payment receipt by email for a specific payment.
   */
  sendReceiptByEmail: async (paymentId: number): Promise<void> => {
    // Note: The apiClient base URL already includes '/api'
    await apiClient.post(`/payments/${paymentId}/send-email`);
  },

  /**
   * Sends an invitation email to a new member or coach.
   * [STUB] Ready for future implementation.
   */
  sendInvitationEmail: async (email: string, role: string, payload?: any): Promise<void> => {
    await apiClient.post("/emails/invite", { email, role, ...payload });
  },

  /**
   * Sends a registration confirmation email.
   * [STUB] Ready for future implementation.
   */
  sendRegistrationEmail: async (userId: string, payload?: any): Promise<void> => {
    await apiClient.post(`/emails/register/${userId}`, payload);
  }
};

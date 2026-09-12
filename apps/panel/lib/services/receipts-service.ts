import { api, apiBlob } from "@/lib/api/client";
import type { ReceiptData } from "@workspace/shared";

/**
 * Estados del contrato `GET /api/payments/:id/receipt` (nunca 409):
 * - ready: número + comprobante + descarga disponible.
 * - pending (HTTP 202): numerado, PDF en preparación.
 * - pre_system: histórico anterior al correlativo, terminal.
 */
export type ReceiptState =
  | {
      available: true;
      pdfStatus: "ready";
      receiptNumber: string;
      receipt: ReceiptData;
      pdfUrl: string;
    }
  | { available: true; pdfStatus: "pending"; receiptNumber: string }
  | { available: false; reason: "pre_system" };

export type SendReceiptEmailResult =
  | { queued: true; attachment: boolean }
  | { queued: false; pdfStatus: "pending" };

interface SendEmailResponse {
  success: boolean;
  queued: boolean;
  attachment?: boolean;
  pdfStatus?: "pending";
}

/**
 * Único acceso desde el panel a los endpoints de comprobantes.
 * Los errores se lanzan para que el caller aplique
 * `mutationError(scope, err, "<genérico>")` + toast (nunca texto crudo).
 */
export const receiptsService = {
  async getReceipt(paymentId: number): Promise<ReceiptState> {
    return await api<ReceiptState>(`/payments/${paymentId}/receipt`);
  },

  /**
   * Solo cuando `pdfStatus === "ready"`; el caller decide según el estado.
   * Solo cliente (`window`): `apiBlob` no reenvía cookies en SSR.
   */
  async downloadReceipt(paymentId: number, filename: string): Promise<void> {
    const blob = await apiBlob<Blob>(`/payments/${paymentId}/receipt/pdf`);
    const url = window.URL.createObjectURL(blob);
    try {
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } finally {
      window.URL.revokeObjectURL(url);
    }
  },

  /** Fallback manual de emisión (owner/manager): responde sin esperar el PDF. */
  async issueReceipt(paymentId: number): Promise<unknown> {
    return await api(`/payments/${paymentId}/issue`, { method: "POST" });
  },

  /**
   * Reenvío manual. `queued:false` (HTTP 202) = numerado sin PDF: el
   * backend re-encoló el render y enviará el email al completarse.
   */
  async sendReceiptEmail(paymentId: number): Promise<SendReceiptEmailResult> {
    const res = await api<SendEmailResponse>(
      `/payments/${paymentId}/send-email`,
      { method: "POST" },
    );
    if (!res.queued) return { queued: false, pdfStatus: "pending" };
    return { queued: true, attachment: res.attachment ?? false };
  },
};

import { apiBlob } from "@/lib/api/client";

/**
 * Service for generating and fetching PDF documents (e.g. payment receipts).
 */
class PdfService {
  async getPersistentReceiptPDF(paymentId: number): Promise<Blob> {
    return await apiBlob<Blob>(`/payments/${paymentId}/pdf`);
  }

  async downloadReceiptPDF(
    paymentId: number,
    filename: string = "recibo.pdf",
  ): Promise<void> {
    try {
      const blob = await this.getPersistentReceiptPDF(paymentId);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error downloading PDF:", error);
      throw new Error("No se pudo descargar el archivo PDF.");
    }
  }
}

export const pdfService = new PdfService();

import { apiClient } from "../api-client";

/**
 * Servicio encargado de gestionar la generación y obtención de documentos PDF.
 * Por ahora actúa como puente hacia la API para documentos persistentes.
 */
class PdfService {
  /**
   * Obtiene un PDF persistente (blob) desde la API para un pago específico.
   * Útil para descarga o previsualización de documentos generados en el servidor.
   */
  async getPersistentReceiptPDF(paymentId: number): Promise<Blob> {
    const response = await apiClient.get(`/payments/${paymentId}/pdf`, {
      responseType: 'blob'
    });
    return response.data;
  }

  /**
   * Descarga un PDF persistente directamente al navegador.
   */
  async downloadReceiptPDF(paymentId: number, filename: string = 'recibo.pdf'): Promise<void> {
    try {
      const blob = await this.getPersistentReceiptPDF(paymentId);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
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

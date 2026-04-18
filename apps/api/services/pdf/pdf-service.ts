import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { ReceiptPdf } from './receipt-pdf';
import { ISubscription } from '@workspace/shared/types';

export class PdfService {
  /**
   * Generates a PDF buffer for a payment receipt.
   */
  async generateReceiptBuffer(subscription: ISubscription, organization: any): Promise<Buffer> {
    try {
      // @ts-ignore - organization type from Drizzle simplified for this call
      return await renderToBuffer(
        React.createElement(ReceiptPdf, {
          subscription,
          organization: {
            name: organization.name,
            legalName: organization.legalName,
            taxId: organization.taxId,
            address: organization.address,
            logo: organization.logo,
            countryCode: organization.countryCode || 'VE',
          }
        }) as any
      );
    } catch (error) {
      console.error('Error generating PDF Buffer:', error);
      throw new Error('No se pudo generar el archivo PDF del recibo.');
    }
  }
}

export const pdfService = new PdfService();

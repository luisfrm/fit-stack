import React from 'react';
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import {
  formatCents,
  type CurrencyFormat,
  type ReceiptData,
} from '@workspace/shared';

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: '#1a1a1a',
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 2,
    borderBottomColor: '#000000',
    paddingBottom: 20,
    marginBottom: 30,
  },
  orgInfo: {
    flexDirection: 'column',
  },
  orgName: {
    fontSize: 14,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  taxIdLabel: {
    fontSize: 8,
    color: '#666666',
    marginTop: 2,
  },
  docHeader: {
    alignItems: 'flex-end',
  },
  docTitle: {
    fontSize: 10,
    fontWeight: 'black',
    color: '#666666',
    letterSpacing: 2,
  },
  docRef: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 4,
  },
  docDate: {
    fontSize: 9,
    color: '#666666',
    marginTop: 2,
  },
  columns: {
    flexDirection: 'row',
    gap: 40,
    marginBottom: 40,
  },
  column: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 9,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    color: '#666666',
    borderBottomWidth: 0.5,
    borderBottomColor: '#eeeeee',
    paddingBottom: 4,
    marginBottom: 10,
  },
  entityRow: {
    marginBottom: 8,
  },
  entityLabel: {
    fontSize: 7,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    color: '#999999',
    marginBottom: 2,
  },
  entityValue: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  table: {
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#f0f0f0',
    borderRadius: 8,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f9f9f9',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  th1: { flex: 8 },
  th2: { flex: 4, textAlign: 'right' },
  tableRow: {
    flexDirection: 'row',
    padding: 15,
    alignItems: 'center',
  },
  td1: { flex: 8 },
  td2: { flex: 4, textAlign: 'right' },
  planName: {
    fontSize: 11,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  planSub: {
    fontSize: 8,
    color: '#666666',
    marginTop: 2,
  },
  amount: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  totals: {
    marginTop: 30,
    alignItems: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 15,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  totalLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    color: '#999999',
  },
  totalValue: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  disclaimerContainer: {
    marginTop: 100,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  disclaimer: {
    fontSize: 7,
    color: '#999999',
    fontStyle: 'italic',
    lineHeight: 1.4,
    marginBottom: 15,
  },
  footerBrand: {
    fontSize: 8,
    fontWeight: 'bold',
    letterSpacing: 2,
    color: '#cccccc',
    textTransform: 'uppercase',
  },
});

function formatDateEs(iso: string, timezone: string | undefined): string {
  // Fecha en hora LOCAL del emisor (un pago a las 23h cae en el mismo día).
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    ...(timezone ? { timeZone: timezone } : {}),
  }).format(new Date(iso));
}

function ReceiptPdfDocument({
  data,
  format,
}: Readonly<{
  data: ReceiptData;
  format: CurrencyFormat;
}>) {
  const { emitter, recipient, document, sale, amounts, method, footer, timezone, voided } =
    data;
  const showRate =
    amounts.currencyPaid !== (amounts.baseCurrency ?? emitter.currency) &&
    amounts.exchangeRateApplied;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.orgInfo}>
            <Text style={styles.orgName}>{emitter.legalName || emitter.name}</Text>
            <Text style={styles.taxIdLabel}>
              {emitter.taxLabel}: {emitter.taxId || '---'}
            </Text>
          </View>
          <View style={styles.docHeader}>
            <Text style={styles.docTitle}>{document.label.toUpperCase()}</Text>
            <Text style={styles.docRef}>#{document.number}</Text>
            <Text style={styles.docDate}>{formatDateEs(document.issuedAt, timezone)}</Text>
          </View>
        </View>

        {voided && (
          <View style={{ marginBottom: 16, alignItems: 'center' }}>
            <Text
              style={{
                fontSize: 14,
                fontWeight: 'black',
                color: '#b91c1c',
                letterSpacing: 4,
                textTransform: 'uppercase',
              }}
            >
              Anulado
            </Text>
          </View>
        )}

        <View style={styles.columns}>
          <View style={styles.column}>
            <Text style={styles.sectionTitle}>Datos del Emisor</Text>
            <View style={styles.entityRow}>
              <Text style={styles.entityLabel}>Dirección / Sede</Text>
              <Text style={styles.entityValue}>
                {emitter.address || 'Dirección no especificada'}
              </Text>
            </View>
          </View>
          <View style={styles.column}>
            <Text style={styles.sectionTitle}>Datos del Receptor</Text>
            <View style={styles.entityRow}>
              <Text style={styles.entityLabel}>Socio / Cliente</Text>
              <Text style={styles.entityValue}>{recipient.name}</Text>
            </View>
            <View style={styles.entityRow}>
              <Text style={styles.entityLabel}>
                {recipient.docLabel ?? 'Doc.'} del Socio
              </Text>
              <Text style={styles.entityValue}>{recipient.documentId || '---'}</Text>
            </View>
          </View>
        </View>

        {method.maskedDetails && method.maskedDetails.length > 0 && (
          <View style={{ marginBottom: 20 }}>
            <Text style={styles.sectionTitle}>Información de la Transacción</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 20 }}>
              {method.maskedDetails.map((detail) => (
                <View key={detail.label} style={{ minWidth: '120pt' }}>
                  <Text style={styles.entityLabel}>{detail.label}</Text>
                  <Text style={styles.entityValue}>{detail.value}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <View style={styles.th1}>
              <Text style={styles.entityLabel}>Descripción</Text>
            </View>
            <View style={styles.th2}>
              <Text style={styles.entityLabel}>Total</Text>
            </View>
          </View>
          <View style={styles.tableRow}>
            <View style={styles.td1}>
              <Text style={styles.planName}>{sale.planName}</Text>
              <Text style={styles.planSub}>
                Período {formatDateEs(sale.periodStart, timezone)} — {formatDateEs(sale.periodEnd, timezone)}
              </Text>
              <Text style={styles.planSub}>Método: {method.name}</Text>
            </View>
            <View style={styles.td2}>
              <Text style={styles.amount}>
                {formatCents(amounts.total, amounts.currencyPaid, format)}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal:</Text>
            <Text style={styles.amount}>
              {formatCents(amounts.subtotal, amounts.currencyPaid, format)}
            </Text>
          </View>
          {amounts.taxDetails.map((line) => (
            <View key={line.name} style={styles.totalRow}>
              <Text style={styles.totalLabel}>
                {line.name} ({Math.round(line.rate * 100)}%):
              </Text>
              <Text style={styles.amount}>
                {formatCents(line.amount, amounts.currencyPaid, format)}
              </Text>
            </View>
          ))}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total Pagado:</Text>
            <Text style={styles.totalValue}>
              {formatCents(amounts.total, amounts.currencyPaid, format)}
            </Text>
          </View>
          {showRate && (
            <Text style={styles.planSub}>
              Tasa aplicada: {amounts.exchangeRateApplied} {amounts.currencyPaid}
            </Text>
          )}
          <Text style={styles.planSub}>
            Pagado el {formatDateEs(sale.paymentDate, timezone)}
          </Text>
        </View>

        <View style={styles.disclaimerContainer}>
          {footer.disclaimer.map((line, index) => (
            <Text key={`disclaimer-${index}`} style={styles.disclaimer}>
              {line}
            </Text>
          ))}
          <Text style={styles.footerBrand}>{footer.generatedBy}</Text>
        </View>
      </Page>
    </Document>
  );
}

/**
 * Renderiza el PDF del comprobante. Usado SOLO por el consumer del paso 2
 * (`handleReceiptRender`), nunca en un request. Import lazy del motor para
 * no engordar el bundle del path de emails.
 */
export async function renderReceiptPdfBytes(
  data: ReceiptData,
  format: CurrencyFormat = 'latam',
): Promise<Uint8Array> {
  const { pdf } = await import('@react-pdf/renderer');
  const blob = await pdf(
    <ReceiptPdfDocument data={data} format={format} />,
  ).toBlob();
  return new Uint8Array(await blob.arrayBuffer());
}

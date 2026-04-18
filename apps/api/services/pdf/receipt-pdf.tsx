import React from 'react';
import { Page, Text, View, Document, StyleSheet, Image, Font } from '@react-pdf/renderer';
import { COUNTRIES } from '@workspace/shared/constants';
import { ISubscription } from '@workspace/shared/types';

// Register a clean font if available, otherwise default to Helvetica
Font.register({
  family: 'Inter',
  fonts: [
    { src: 'https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hJPdtEn0.woff2', fontWeight: 400 },
    { src: 'https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuI6fAZ9hJPdtEn0.woff2', fontWeight: 700 },
    { src: 'https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuGKYAZ9hJPdtEn0.woff2', fontWeight: 900 },
  ]
});

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
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logo: {
    width: 60,
    height: 60,
    borderRadius: 8,
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
    color: '#666',
    marginTop: 2,
  },
  docHeader: {
    alignItems: 'flex-end',
  },
  docTitle: {
    fontSize: 10,
    fontWeight: 'black',
    color: '#666',
    letterSpacing: 2,
  },
  docRef: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 4,
  },
  docDate: {
    fontSize: 9,
    color: '#666',
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
    color: '#666',
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
    color: '#999',
    marginBottom: 2,
  },
  entityValue: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  entitySub: {
    fontSize: 8,
    color: '#666',
    fontStyle: 'italic',
    marginTop: 2,
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
    color: '#666',
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
    color: '#999',
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
    color: '#999',
    fontStyle: 'italic',
    lineHeight: 1.4,
    marginBottom: 15,
  },
  footerBrand: {
    fontSize: 8,
    fontWeight: 'bold',
    letterSpacing: 2,
    color: '#ccc',
    textTransform: 'uppercase',
  }
});

interface ReceiptPdfProps {
  subscription: ISubscription & {
    paymentDetails?: Array<{ label: string; value: string }>;
  };
  organization: {
    name: string;
    legalName?: string | null;
    taxId?: string | null;
    address?: string | null;
    logo?: string | null;
    countryCode: string;
  };
}

export const ReceiptPdf = ({ subscription, organization }: ReceiptPdfProps) => {
  const countryConfig = COUNTRIES[organization.countryCode] || COUNTRIES.VE;
  const paymentDate = subscription.paymentDate ? new Date(subscription.paymentDate) : new Date();

  const formattedDate = paymentDate.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });

  const formattedAmount = new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: subscription.currencyPaid || 'USD',
  }).format((subscription.amountPaid ?? 0) / 100);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            {organization.logo && (
              <Image
                src={organization.logo.startsWith('http') ? organization.logo : `https://fit-stack.com/api/media/${organization.logo}`}
                style={styles.logo}
              />
            )}
            <View style={styles.orgInfo}>
              <Text style={styles.orgName}>{organization.legalName || organization.name}</Text>
              <Text style={styles.taxIdLabel}>{countryConfig?.taxLabel}: {organization.taxId || '---'}</Text>
            </View>
          </View>

          <View style={styles.docHeader}>
            <Text style={styles.docTitle}>COMPROBANTE DE PAGO</Text>
            <Text style={styles.docRef}>#{subscription.paymentId?.toString().padStart(6, '0') || '---'}</Text>
            <Text style={styles.docDate}>{formattedDate}</Text>
          </View>
        </View>

        {/* Columns */}
        <View style={styles.columns}>
          <View style={styles.column}>
            <Text style={styles.sectionTitle}>Datos del Emisor</Text>
            <View style={styles.entityRow}>
              <Text style={styles.entityLabel}>Dirección / Sede</Text>
              <Text style={styles.entityValue}>{organization.address || 'Dirección no especificada'}</Text>
            </View>
          </View>

          <View style={styles.column}>
            <Text style={styles.sectionTitle}>Datos del Receptor</Text>
            <View style={styles.entityRow}>
              <Text style={styles.entityLabel}>Socio / Cliente</Text>
              <Text style={styles.entityValue}>{subscription.memberName}</Text>
            </View>
            <View style={styles.entityRow}>
              <Text style={styles.entityLabel}>{countryConfig?.docLabel} del Socio</Text>
              <Text style={styles.entityValue}>{subscription.memberDocumentId || '---'}</Text>
            </View>
          </View>
        </View>

        {/* Dynamic Payment Details Section */}
        {subscription.paymentDetails && subscription.paymentDetails.length > 0 && (
          <View style={{ marginBottom: 20 }}>
            <Text style={styles.sectionTitle}>Información de la Transacción</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 20 }}>
              {subscription.paymentDetails.map((detail) => (
                <View key={detail.label} style={{ minWidth: '120pt' }}>
                  <Text style={styles.entityLabel}>{detail.label}</Text>
                  <Text style={styles.entityValue}>{detail.value}</Text>
                </View>
              ))}
            </View>
          </View>
        )}


        {/* Detail Table */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <View style={styles.th1}><Text style={styles.entityLabel}>Descripción</Text></View>
            <View style={styles.th2}><Text style={styles.entityLabel}>Total</Text></View>
          </View>
          <View style={styles.tableRow}>
            <View style={styles.td1}>
              <Text style={styles.planName}>{subscription.planName || 'Plan Gym'}</Text>
              <Text style={styles.planSub}>Suscripción activa • Pago por período</Text>
              {subscription.paymentMethod && (
                <Text style={styles.planSub}>Método: {subscription.paymentMethod.replaceAll('_', ' ').toUpperCase()}</Text>
              )}
            </View>
            <View style={styles.td2}>
              <Text style={styles.amount}>{formattedAmount}</Text>
            </View>
          </View>
        </View>

        {/* Totals */}
        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total Pagado:</Text>
            <Text style={styles.totalValue}>{formattedAmount}</Text>
          </View>
          {subscription.exchangeRateApplied && (
            <Text style={styles.planSub}>
              Tasa aplicada: 1.00 USD = {subscription.exchangeRateApplied} {subscription.currencyPaid}
            </Text>
          )}
        </View>

        {/* Disclaimer */}
        <View style={styles.disclaimerContainer}>
          <Text style={styles.disclaimer}>
            Este documento es un comprobante de pago referencial generado automáticamente por la plataforma Fit-Stack.
            No constituye una factura fiscal y tiene como único fin dejar constancia de la operación realizada entre las partes.
          </Text>
          <Text style={styles.footerBrand}>Fit-Stack Global Registry</Text>
        </View>
      </Page>
    </Document>
  );
};

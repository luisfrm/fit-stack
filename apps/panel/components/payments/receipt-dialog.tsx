"use client";

import * as React from "react";
import {
  Modal,
  Text,
  Badge,
  Separator,
  Button,
  toast,
  Title,
  Eyebrow,
  Avatar,
} from "@workspace/ui/components";
import { type ISubscription } from "@/types/dashboard";
import {
  Mail,
  Printer,
  ExternalLink,
  ShieldCheck
} from "lucide-react";
import { ValueConverter, type CurrencyFormat } from "@/lib/utils/value-converters";
import { useSettings, SETTINGS_KEYS } from "@/lib/hooks/use-settings";
import { useReactToPrint } from "react-to-print";
import { emailsService } from "@/lib/services/emails-service";
import { uploadService } from "@/lib/services/upload-service";
import { useAuth } from "@/lib/hooks/use-auth";
import { COUNTRIES } from "@workspace/shared/constants";

interface ReceiptDialogProps {
  readonly initialData: ISubscription;
  readonly trigger: React.ReactNode;
}

export function ReceiptDialog({ initialData: subscription, trigger }: ReceiptDialogProps) {
  const { settings } = useSettings();
  const { activeOrganization: org } = useAuth();
  const [isSendingEmail, setIsSendingEmail] = React.useState(false);
  const currencyFormat = (settings[SETTINGS_KEYS.CURRENCY_FORMAT] as CurrencyFormat) || "latam";
  const countryConfig = COUNTRIES[org?.countryCode || "VE"] || COUNTRIES.VE;

  const contentRef = React.useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({
    contentRef,
    documentTitle: `Recibo_${subscription.paymentId || 'Pago'}`,
  });

  const paymentDate = subscription.paymentDate
    // ... (omitting lines for brevity in diff tool logic context, but keeping necessary logic)
    ? new Date(subscription.paymentDate)
    : new Date();

  const formattedDate = paymentDate.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });


  const handleSendEmail = async () => {
    // Validar disponibilidad de correo antes de intentar el envío
    if (!subscription.memberEmail) {
      toast.error("Este cliente no tiene un correo electrónico registrado en su ficha.");
      return;
    }

    setIsSendingEmail(true);
    try {
      if (!subscription.paymentId) throw new Error("ID de pago no disponible");
      await emailsService.sendReceiptByEmail(subscription.paymentId);
      toast.success("Comprobante enviado al correo del miembro");
    } catch (error: any) {
      toast.error(error.message || "Error al enviar el correo");
    } finally {
      setIsSendingEmail(false);
    }
  };

  const memberInitials = subscription.memberName
    ? subscription.memberName.split(" ").map(n => n[0]).join("").toUpperCase().substring(0, 2)
    : "??";

  return (
    <Modal
      trigger={trigger}
      title="Comprobante de Pago"
      size="md"
    >
      <div ref={contentRef} id="receipt-printable-area" className="flex flex-col py-6">
        {/* Print Styles */}
        <style dangerouslySetInnerHTML={{
          __html: `
          @media print {
            @page { 
              margin: 15mm; 
              size: A4;
            }
            #receipt-printable-area { 
              width: 100% !important;
              padding: 5mm !important;
              background: white !important; 
              color: black !important;
              font-family: 'Inter', system-ui, sans-serif !important;
            }
            
            /* Text Hierarchy Reset */
            #receipt-printable-area * {
              color: #000 !important;
              opacity: 1 !important;
              -webkit-print-color-adjust: exact !important;
              color-adjust: exact !important;
              text-shadow: none !important;
            }

            #receipt-printable-area h1 { 
              font-size: 24pt !important; 
              font-weight: 800 !important;
              margin-bottom: 20px !important;
              letter-spacing: -0.02em !important;
              text-align: center !important;
            }

            #receipt-printable-area h2 { 
              font-size: 16pt !important; 
              font-weight: 700 !important;
              font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
            }

            /* Labels: Modern, clean, not bold */
            #receipt-printable-area .label-text { 
              font-size: 10.5pt !important; 
              font-weight: 500 !important;
              color: #64748b !important;
              text-transform: uppercase !important;
              letter-spacing: 0.05em !important;
            }

            /* Values: Clear and legible */
            #receipt-printable-area .value-text { 
              font-size: 11.5pt !important; 
              font-weight: 600 !important;
            }

            #receipt-printable-area .mono-text {
              font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
              font-size: 10pt !important;
              letter-spacing: -0.01em !important;
            }

            /* Separators */
            #receipt-printable-area hr,
            #receipt-printable-area .border-t {
              border-color: #f1f5f9 !important;
              border-width: 0.5pt !important;
              margin: 4mm 0 !important;
            }

            /* Badge Refinement */
            #receipt-printable-area [data-slot="badge"] {
              border: 0.5pt solid #000 !important;
              padding: 2pt 6pt !important;
              font-size: 9pt !important;
              font-weight: 700 !important;
              text-transform: uppercase !important;
              border-radius: 4px !important;
            }

            .no-print { display: none !important; }
          }
        `}} />

        <div className="flex flex-col items-center text-center px-6 mb-8 gap-2">
          <Avatar
            size="2xl"
            variant="premium"
            src={subscription.memberImage ? uploadService.getMediaUrl(subscription.memberImage) : null}
            fallback={memberInitials}
            className="mb-2"
          />
          <Title as="h1" size="lg" accent="primary">Recibo de Pago</Title>
          <Text variant="muted" size="xs" className="mono-text opacity-50">
            REF: #{subscription.paymentId || '---'}
          </Text>
        </div>

        {/* Receipt Details List */}
        <div className="px-8 space-y-5">
          <div className="space-y-3">
            <div className="flex justify-between items-start gap-4">
              <Text className="label-text">Miembro</Text>
              <div className="text-right flex flex-col items-end gap-0.5">
                <Text className="value-text">{subscription.memberName || "---"}</Text>
                <Text size="xs" variant="primary" weight="bold" italic uppercase className="opacity-80">{subscription.planName}</Text>
              </div>
            </div>

            {subscription.memberDocumentId && (
              <div className="flex justify-between items-center gap-4">
                <Text className="label-text">{countryConfig?.docLabel} del Socio</Text>
                <div className="flex items-center gap-1.5">
                  <ShieldCheck size={12} className="text-muted-foreground opacity-50" />
                  <Text className="value-text">{subscription.memberDocumentId}</Text>
                </div>
              </div>
            )}

            <Separator className="opacity-5" />

            <div className="flex justify-between items-center gap-4">
              <Text className="label-text">Fecha de Pago</Text>
              <Text className="value-text">{formattedDate}</Text>
            </div>

            <div className="flex justify-between items-center gap-4">
              <Text className="label-text">Estado</Text>
              <Badge variant="success" size="sm">Completado</Badge>
            </div>

            <div className="flex justify-between items-center gap-4">
              <Text className="label-text">Método de Pago</Text>
              <Text className="value-text capitalize">
                {subscription.paymentMethod?.replaceAll('_', ' ')}
              </Text>
            </div>

            {subscription.exchangeRateApplied && (
              <div className="flex justify-between items-center gap-4">
                <Text className="label-text">Tasa Aplicada</Text>
                <Text className="mono-text opacity-60">
                  1 USD = {subscription.exchangeRateApplied} {subscription.currencyPaid}
                </Text>
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-dashed border-border/30">
            <div className="flex justify-between items-center">
              <Text className="label-text">Total Pagado</Text>
              <Title as="h2" size="lg" accent="primary">
                {ValueConverter.format((subscription.amountPaid ?? 0) / 100, subscription.currencyPaid ?? 'USD', currencyFormat)}
              </Title>
            </div>
            <Text variant="muted" size="xs" italic className="opacity-30 mt-0.5">
              Valor del plan original: {ValueConverter.format((subscription.planSnapshotPrice ?? 0) / 100, subscription.planSnapshotCurrency ?? 'USD', currencyFormat)}
            </Text>
          </div>

          {/* Operation Details (Reference / Evidence) */}
          {subscription.paymentMethodDetails && (
            <div className="pt-5 space-y-3">
              <Eyebrow size="sm" accent="muted">Información de Operación</Eyebrow>
              <div className="space-y-1.5">
                {Array.isArray(subscription.paymentMethodDetails) ? (
                  // New Format: IPaymentMethodDetail[]
                  subscription.paymentMethodDetails.map((detail, idx) => {
                    const isImage = detail.type === 'file' ||
                      (detail.type === undefined && typeof detail.value === 'string' && (detail.value.startsWith('http') || detail.value.startsWith('/')));

                    return (
                      <div key={`${detail.label}-${idx}`} className="flex justify-between items-center gap-4 py-0.5">
                        <Text className="label-text">{detail.label}</Text>
                        {isImage ? (
                          <Button variant="link" size="xs" asChild className="h-auto p-0 text-primary">
                            <a href={uploadService.getMediaUrl(String(detail.value))} target="_blank" rel="noopener noreferrer">
                              VER CAPTURE <ExternalLink size={10} className="ml-1" />
                            </a>
                          </Button>
                        ) : (
                          <Text className="mono-text opacity-60">{detail.value}</Text>
                        )}
                      </div>
                    );
                  })
                ) : (
                  // Legacy Format: Record<string, any>
                  Object.entries(subscription.paymentMethodDetails).map(([key, value]) => {
                    if (!value || key === 'last4') return null;
                    const label = key.replaceAll('_', ' ').toUpperCase();
                    const isImage = typeof value === 'string' && (value.startsWith('http') || value.startsWith('/'));

                    return (
                      <div key={key} className="flex justify-between items-center gap-4 py-0.5">
                        <Text className="label-text">{label}</Text>
                        {isImage ? (
                          <Button variant="link" size="xs" asChild className="h-auto p-0 text-primary">
                            <a href={uploadService.getMediaUrl(String(value))} target="_blank" rel="noopener noreferrer">
                              VER CAPTURE <ExternalLink size={10} className="ml-1" />
                            </a>
                          </Button>
                        ) : (
                          <Text className="mono-text opacity-60">{value}</Text>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-8 no-print">
            <Button
              variant="primary"
              size="md"
              fullWidth
              onClick={handleSendEmail}
              loading={isSendingEmail}
              leftIcon={<Mail size={18} />}
            >
              ENVIAR
            </Button>

            <Button
              variant="outlined"
              size="md"
              className="px-4 shrink-0"
              onClick={() => handlePrint()}
            >
              <Printer size={18} />
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

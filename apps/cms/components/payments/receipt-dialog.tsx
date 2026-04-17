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
  ExternalLink
} from "lucide-react";
import { ValueConverter, type CurrencyFormat } from "@/lib/utils/value-converters";
import { useSettings, SETTINGS_KEYS } from "@/lib/hooks/use-settings";
import { emailsService } from "@/lib/services/emails-service";
import { uploadService } from "@/lib/services/upload-service";

interface ReceiptDialogProps {
  readonly initialData: ISubscription;
  readonly trigger: React.ReactNode;
}

export function ReceiptDialog({ initialData: subscription, trigger }: ReceiptDialogProps) {
  const { settings } = useSettings();
  const [isSendingEmail, setIsSendingEmail] = React.useState(false);
  const currencyFormat = (settings[SETTINGS_KEYS.CURRENCY_FORMAT] as CurrencyFormat) || "latam";

  const paymentDate = subscription.paymentDate
    ? new Date(subscription.paymentDate)
    : new Date();

  const formattedDate = paymentDate.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });

  const handlePrint = () => {
    globalThis.print();
  };

  const handleSendEmail = async () => {
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
      <div id="receipt-printable-area" className="flex flex-col py-6">
        {/* Print Styles */}
        <style dangerouslySetInnerHTML={{
          __html: `
          @media print {
            @page { margin: 10mm; }
            body * { visibility: hidden; }
            #receipt-printable-area, #receipt-printable-area * { visibility: visible; }
            #receipt-printable-area { 
              position: absolute; 
              left: 50%; 
              top: 0; 
              transform: translateX(-50%) scale(1.25);
              transform-origin: top center;
              width: 15cm; 
              padding: 2rem;
              background: white !important; 
              color: black !important;
            }
            #receipt-printable-area h1, 
            #receipt-printable-area h2 { font-size: 24pt !important; margin-bottom: 10px; }
            #receipt-printable-area p, 
            #receipt-printable-area span { font-size: 13pt !important; }
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
          <Title size="lg" accent="primary">Recibo de Pago</Title>
          <Text variant="muted" size="xs" className="opacity-50 font-mono">
            REF: #{subscription.paymentId || '---'}
          </Text>
        </div>

        {/* Receipt Details List */}
        <div className="px-8 space-y-6">
          <div className="space-y-4">
            <div className="flex justify-between items-start gap-4">
              <Text variant="muted" size="sm" weight="semibold">Miembro</Text>
              <div className="text-right flex flex-col items-end gap-1">
                <Text weight="bold">{subscription.memberName || "---"}</Text>
                <Text size="xs" variant="primary" weight="bold" italic uppercase>{subscription.planName}</Text>
              </div>
            </div>

            <Separator className="opacity-10" />

            <div className="flex justify-between items-center gap-4">
              <Text variant="muted" size="sm" weight="semibold">Fecha de Pago</Text>
              <Text weight="medium" size="sm">{formattedDate}</Text>
            </div>

            <div className="flex justify-between items-center gap-4">
              <Text variant="muted" size="sm" weight="semibold">Estado</Text>
              <Badge variant="success" size="sm">Completado</Badge>
            </div>

            <div className="flex justify-between items-center gap-4">
              <Text variant="muted" size="sm" weight="semibold">Método de Pago</Text>
              <Text weight="medium" size="sm" className="capitalize">
                {subscription.paymentMethod?.replaceAll('_', ' ')}
              </Text>
            </div>

            {subscription.exchangeRateApplied && (
              <div className="flex justify-between items-center gap-4">
                <Text variant="muted" size="sm" weight="semibold">Tasa Aplicada</Text>
                <Text weight="medium" size="xs" className="font-mono">
                  1 USD = {subscription.exchangeRateApplied} {subscription.currencyPaid}
                </Text>
              </div>
            )}
          </div>

          <div className="pt-4 border-t-2 border-dashed border-border/50">
            <div className="flex justify-between items-center">
              <Title size="sm" accent="primary">Total Pagado</Title>
              <Title size="lg" accent="primary">
                {ValueConverter.format((subscription.amountPaid ?? 0) / 100, subscription.currencyPaid ?? 'USD', currencyFormat)}
              </Title>
            </div>
            <Text variant="muted" size="xs" italic className="opacity-40 mt-1">
              Valor del plan original: {ValueConverter.format((subscription.planSnapshotPrice ?? 0) / 100, subscription.planSnapshotCurrency ?? 'USD', currencyFormat)}
            </Text>
          </div>

          {/* Operation Details (Reference / Evidence) */}
          {subscription.paymentMethodDetails && (
            <div className="pt-6 space-y-3">
              <Eyebrow size="sm" accent="muted">Información de Operación</Eyebrow>
              <div className="space-y-2">
                {Array.isArray(subscription.paymentMethodDetails) ? (
                  // New Format: IPaymentMethodDetail[]
                  subscription.paymentMethodDetails.map((detail, idx) => {
                    const isImage = detail.type === 'file' || 
                                   (detail.type === undefined && typeof detail.value === 'string' && (detail.value.startsWith('http') || detail.value.startsWith('/')));
                    
                    return (
                      <div key={`${detail.label}-${idx}`} className="flex justify-between items-center gap-4 py-1">
                        <Text size="xs" variant="muted" weight="bold" className="uppercase">{detail.label}</Text>
                        {isImage ? (
                          <Button variant="link" size="xs" asChild className="h-auto p-0 text-primary">
                            <a href={uploadService.getMediaUrl(String(detail.value))} target="_blank" rel="noopener noreferrer">
                              VER CAPTURE <ExternalLink size={10} className="ml-1" />
                            </a>
                          </Button>
                        ) : (
                          <Text size="xs" className="font-mono opacity-60">{detail.value}</Text>
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
                      <div key={key} className="flex justify-between items-center gap-4 py-1">
                        <Text size="xs" variant="muted" weight="bold">{label}</Text>
                        {isImage ? (
                          <Button variant="link" size="xs" asChild className="h-auto p-0 text-primary">
                            <a href={uploadService.getMediaUrl(String(value))} target="_blank" rel="noopener noreferrer">
                              VER CAPTURE <ExternalLink size={10} className="ml-1" />
                            </a>
                          </Button>
                        ) : (
                          <Text size="xs" className="font-mono opacity-60">{value}</Text>
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
              onClick={handlePrint}
            >
              <Printer size={18} />
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

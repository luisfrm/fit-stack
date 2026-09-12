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
  ShieldCheck,
  Download,
  RefreshCw,
  FileWarning,
  FilePlus2,
} from "lucide-react";
import {
  formatCents,
  PAYMENT_STATUSES,
  type CurrencyFormat,
  type ReceiptData,
} from "@workspace/shared";
import { useReactToPrint } from "react-to-print";
import {
  receiptsService,
  type ReceiptState,
} from "@/lib/services/receipts-service";
import { uploadService } from "@/lib/services/upload-service";
import { useAuth } from "@/lib/hooks/use-auth";
import { mutationError } from "@/lib/errors";
import { useRouter } from "next/navigation";

interface ReceiptDialogProps {
  readonly initialData: ISubscription;
  readonly trigger: React.ReactNode;
  readonly onSuccess?: () => void | Promise<void>;
}

function formatDay(iso: string | Date, timeZone?: string): string {
  return new Date(iso).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(timeZone ? { timeZone } : {}),
  });
}

function apiCode(err: unknown): string | undefined {
  return (err as { data?: { code?: string } })?.data?.code;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center gap-4">
      <Text className="label-text">{label}</Text>
      <div className="text-right">{children}</div>
    </div>
  );
}

function ReadyBody({ receipt, currencyFormat, timezone }: { receipt: ReceiptData; currencyFormat: CurrencyFormat; timezone: string }) {
  const tz = timezone;
  const showRate =
    !!receipt.amounts.baseCurrency &&
    receipt.amounts.baseCurrency !== receipt.amounts.currencyPaid &&
    !!receipt.amounts.exchangeRateApplied;
  return (
    <div className="space-y-3">
      <Row label="Miembro">
        <div className="flex flex-col items-end gap-0.5">
          <Text className="value-text">{receipt.recipient.name}</Text>
          {receipt.recipient.documentId && (
            <div className="flex items-center gap-1.5">
              <ShieldCheck size={12} className="text-muted-foreground opacity-50" />
              <Text size="xs" variant="muted" className="mono-text">
                {receipt.recipient.docLabel ? `${receipt.recipient.docLabel}: ` : ""}
                {receipt.recipient.documentId}
              </Text>
            </div>
          )}
        </div>
      </Row>

      <Separator className="opacity-5" />

      <Row label="Plan">
        <Text className="value-text">{receipt.sale.planName}</Text>
      </Row>
      <Row label="Vigencia">
        <Text className="value-text">
          {formatDay(receipt.sale.periodStart, tz)} — {formatDay(receipt.sale.periodEnd, tz)}
        </Text>
      </Row>
      <Row label="Fecha de Pago">
        <Text className="value-text">{formatDay(receipt.sale.paymentDate, tz)}</Text>
      </Row>
      <Row label="Emisión">
        <Text className="value-text">{formatDay(receipt.document.issuedAt, tz)}</Text>
      </Row>
      <Row label="Método de Pago">
        <Text className="value-text capitalize">
          {receipt.method.name.replaceAll("_", " ")}
        </Text>
      </Row>
      {showRate && (
        <Row label="Tasa Aplicada">
          <Text className="mono-text opacity-60">
            1 {receipt.amounts.baseCurrency} = {receipt.amounts.exchangeRateApplied}{" "}
            {receipt.amounts.currencyPaid}
          </Text>
        </Row>
      )}

      <div className="pt-4 border-t border-dashed border-border/30 space-y-2">
        <Row label="Subtotal">
          <Text className="value-text">
            {formatCents(receipt.amounts.subtotal, receipt.amounts.currencyPaid, currencyFormat)}
          </Text>
        </Row>
        {receipt.amounts.taxDetails.map((line, i) => (
          <Row key={`${line.name}-${i}`} label={`${line.name} (${Number((line.rate * 100).toFixed(2))}%)`}>
            <Text className="value-text">
              {formatCents(line.amount, receipt.amounts.currencyPaid, currencyFormat)}
            </Text>
          </Row>
        ))}
        {receipt.amounts.taxTotal > 0 && (
          <Row label="Impuestos">
            <Text className="value-text">
              {formatCents(receipt.amounts.taxTotal, receipt.amounts.currencyPaid, currencyFormat)}
            </Text>
          </Row>
        )}
        <div className="flex justify-between items-center pt-1">
          <Text className="label-text">Total Pagado</Text>
          <Title as="h2" size="lg" accent="primary">
            {formatCents(receipt.amounts.total, receipt.amounts.currencyPaid, currencyFormat)}
          </Title>
        </div>
      </div>

      {receipt.method.maskedDetails && receipt.method.maskedDetails.length > 0 && (
        <div className="pt-5 space-y-3">
          <Eyebrow size="sm" accent="muted">Información de Operación</Eyebrow>
          <div className="space-y-1.5">
            {receipt.method.maskedDetails.map((detail) => (
              <div key={detail.label} className="flex justify-between items-center gap-4 py-0.5">
                <Text className="label-text">{detail.label}</Text>
                <Text className="mono-text opacity-60">{detail.value}</Text>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="pt-5 space-y-1.5">
        {receipt.footer.disclaimer.map((line, i) => (
          <Text key={`${i}-${line.slice(0, 24)}`} variant="muted" size="xs" italic className="opacity-60">
            {line}
          </Text>
        ))}
        <Text variant="muted" size="xs" className="opacity-30">
          {receipt.footer.generatedBy}
        </Text>
      </div>
    </div>
  );
}

export function ReceiptDialog({ initialData: subscription, trigger, onSuccess }: ReceiptDialogProps) {
  const router = useRouter();
  const { activeOrganization: org } = useAuth();
  // Sin fallback silencioso: currencyFormat es NOT NULL en la org.
  const currencyFormat = org?.currencyFormat as CurrencyFormat | undefined;

  const [open, setOpen] = React.useState(false);
  const [state, setState] = React.useState<ReceiptState | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [isSendingEmail, setIsSendingEmail] = React.useState(false);
  const [isDownloading, setIsDownloading] = React.useState(false);
  const [isIssuing, setIsIssuing] = React.useState(false);

  const paymentId = subscription.paymentId;

  const load = React.useCallback(async () => {
    if (!paymentId) {
      setLoadError("Pago no disponible.");
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      setState(await receiptsService.getReceipt(paymentId));
    } catch (err) {
      // Único log del camino de carga (sin toast): el feedback UX es el
      // estado inline con Reintentar. Los demás caminos usan mutationError.
      console.error("[ReceiptDialog]", err);
      setLoadError("No se pudo cargar el comprobante.");
    } finally {
      setLoading(false);
    }
  }, [paymentId]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    // Recarga siempre al abrir: cubre pending→ready y ANULADO externo.
    if (next) {
      setState(null);
      void load();
    }
  };

  const contentRef = React.useRef<HTMLDivElement>(null);
  const readyNumber =
    state?.available && state.pdfStatus === "ready" ? state.receiptNumber : null;
  const handlePrint = useReactToPrint({
    contentRef,
    documentTitle: `Comprobante_${readyNumber ?? "pago"}`,
  });

  const refreshAfterMutation = async () => {
    await onSuccess?.();
    router.refresh();
  };

  const handleSendEmail = async () => {
    if (!paymentId) return;
    setIsSendingEmail(true);
    try {
      const res = await receiptsService.sendReceiptEmail(paymentId);
      toast.success(
        res.queued
          ? "Comprobante enviado al correo del miembro"
          : "Comprobante en preparación: se enviará al generarse",
      );
      await refreshAfterMutation();
    } catch (err) {
      if (apiCode(err) === "MEMBER_EMAIL_MISSING") {
        toast.error("Este cliente no tiene correo registrado: imprima en mostrador.");
      } else {
        toast.error(mutationError("ReceiptDialog", err, "No se pudo enviar el comprobante"));
      }
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleDownload = async () => {
    if (!paymentId || !readyNumber) return;
    setIsDownloading(true);
    try {
      await receiptsService.downloadReceipt(paymentId, `${readyNumber}.pdf`);
      toast.success("Comprobante descargado");
    } catch (err) {
      toast.error(mutationError("ReceiptDialog", err, "No se pudo descargar el comprobante"));
    } finally {
      setIsDownloading(false);
    }
  };

  const handleIssue = async () => {
    if (!paymentId) return;
    setIsIssuing(true);
    try {
      await receiptsService.issueReceipt(paymentId);
      toast.success("Comprobante emitido: el PDF se está generando");
      await load();
      await refreshAfterMutation();
    } catch (err) {
      toast.error(mutationError("ReceiptDialog", err, "No se pudo emitir el comprobante"));
    } finally {
      setIsIssuing(false);
    }
  };

  const gymName = org?.name || "Gimnasio";
  const gymInitials = gymName.split(" ").map((n) => n[0]).join("").toUpperCase().substring(0, 2);

  const readyState =
    !loading && !loadError && state?.available && state.pdfStatus === "ready" ? state : null;
  // TZ de visualización: la fijada al comprobante en emisión, con fallback
  // a la org de la sesión. Nunca la del navegador. Registro del pago y
  // emisión del servidor se ajustan a esta TZ.
  const displayTz = readyState ? (readyState.receipt.timezone ?? org?.timezone) : undefined;
  const readyBlocked = !!readyState && (!currencyFormat || !displayTz);

  return (
    <Modal
      trigger={trigger}
      title="Comprobante de Pago"
      size="md"
      open={open}
      onOpenChange={handleOpenChange}
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
            src={org?.logo ? uploadService.getMediaUrl(org.logo) : null}
            fallback={gymInitials}
            className="mb-2"
          />
          <Title as="h1" size="lg" accent="primary">
            {state?.available && state.pdfStatus === "ready"
              ? state.receipt.document.label
              : "Comprobante de Pago"}
          </Title>
          <Text variant="muted" size="xs" className="mono-text opacity-50">
            {state?.available
              ? state.receiptNumber
              : "Anterior al sistema correlativo"}
          </Text>
          {state?.available && state.pdfStatus === "ready" && state.receipt.voided && (
            <Badge variant="destructive" size="sm">Anulado</Badge>
          )}
        </div>

        <div className="px-8 space-y-5">
          {loading && (
            <Text variant="muted" size="sm" className="text-center py-8">
              Cargando comprobante…
            </Text>
          )}

          {!loading && loadError && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Text variant="muted" size="sm">{loadError}</Text>
              <Button variant="outlined" size="sm" onClick={() => void load()}>
                Reintentar
              </Button>
            </div>
          )}

          {readyBlocked && (
            <div className="flex flex-col items-center text-center gap-2 py-6">
              <FileWarning size={28} className="text-muted-foreground opacity-50" />
              <Text weight="bold">Configuración incompleta</Text>
              <Text variant="muted" size="sm">
                La organización no tiene zona horaria o formato de moneda:
                complete la configuración para ver el comprobante.
              </Text>
            </div>
          )}

          {readyState && !readyBlocked && currencyFormat && displayTz && (
            <ReadyBody receipt={readyState.receipt} currencyFormat={currencyFormat} timezone={displayTz} />
          )}

          {!loading && !loadError && state?.available && state.pdfStatus === "pending" && (
            <div className="flex flex-col items-center text-center gap-2 py-6">
              <RefreshCw size={28} className="text-muted-foreground opacity-50" />
              <Text weight="bold">PDF en preparación</Text>
              <Text variant="muted" size="sm">
                Comprobante {state.receiptNumber}: el documento se está generando.
                Re-consulte en unos segundos.
              </Text>
            </div>
          )}

          {!loading && !loadError && state && !state.available && (
            <div className="flex flex-col items-center text-center gap-2 py-6">
              <FileWarning size={28} className="text-muted-foreground opacity-50" />
              <Text weight="bold">Anterior al sistema correlativo</Text>
              <Text variant="muted" size="sm">
                Este pago es anterior al sistema de comprobantes numerados:
                no tiene número ni PDF descargable.
              </Text>
            </div>
          )}

          {/* Action Buttons */}
          {!loading && !loadError && !readyBlocked && state && (
            <div className="flex gap-3 pt-8 no-print">
              {state.available && state.pdfStatus === "ready" && (
                <Button
                  variant="outlined"
                  size="md"
                  onClick={() => void handleDownload()}
                  loading={isDownloading}
                  leftIcon={<Download size={18} />}
                >
                  PDF
                </Button>
              )}
              {state.available && state.pdfStatus === "pending" && (
                <Button
                  variant="outlined"
                  size="md"
                  onClick={() => void load()}
                  leftIcon={<RefreshCw size={18} />}
                >
                  Re-consultar
                </Button>
              )}
              {!state.available && subscription.paymentStatus === PAYMENT_STATUSES.VALIDATED && (
                <Button
                  variant="outlined"
                  size="md"
                  onClick={() => void handleIssue()}
                  loading={isIssuing}
                  leftIcon={<FilePlus2 size={18} />}
                >
                  Emitir
                </Button>
              )}
              <Button
                variant="primary"
                size="md"
                fullWidth
                onClick={() => void handleSendEmail()}
                loading={isSendingEmail}
                leftIcon={<Mail size={18} />}
              >
                Enviar
              </Button>
              {state.available && state.pdfStatus === "ready" && (
                <Button
                  variant="outlined"
                  size="md"
                  className="px-4 shrink-0"
                  onClick={() => handlePrint()}
                >
                  <Printer size={18} />
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

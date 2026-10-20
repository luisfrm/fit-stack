"use client";

import * as React from "react";
import { Download, ReceiptText, RefreshCw } from "lucide-react";
import { Badge, Button, Card, Text, toast } from "@workspace/ui/components";
import { Title } from "@workspace/ui";
import { useAuth } from "@workspace/auth/hooks";
import {
  getOrgReceipts,
  orgReceiptsService,
  type OrgReceiptRow,
} from "@/lib/services/org-receipts";
import { mutationError, formatCents } from "@workspace/shared";

/** Duration units as shown next to the plan name (snapshot of the payment). */
const DURATION_UNIT_LABELS: Record<string, string> = {
  day: "día",
  week: "semana",
  month: "mes",
  year: "año",
};

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatPeriod(row: OrgReceiptRow): string {
  const label = DURATION_UNIT_LABELS[row.planDurationUnit] ?? row.planDurationUnit;
  return `${row.planDurationValue} ${label}${row.planDurationValue === 1 ? "" : "s"}`;
}

type ReceiptBadgeVariant = "success" | "info" | "destructive" | "outline";

/**
 * Receipt state of a SaaS payment. `receiptVoided` / `voided` win over the
 * payment status: an ANULADO receipt consumed its `FS-N` but is not income.
 */
function receiptStatus(row: OrgReceiptRow): { label: string; variant: ReceiptBadgeVariant } {
  if (row.receiptVoided || row.status === "voided") {
    return { label: "Anulado", variant: "destructive" };
  }
  if (row.status === "processing") return { label: "En proceso", variant: "info" };
  if (row.status === "validated" && row.receiptNumber) {
    return { label: "Emitido", variant: "success" };
  }
  return { label: "Sin comprobante", variant: "outline" };
}

/**
 * Amount paired with the currency it belongs to (never crossed):
 * `baseAmount` is in the plan currency, `amountPaid` in the paid one.
 */
function displayAmount(row: OrgReceiptRow): { cents: number; currency: string } {
  if (row.baseAmount != null) {
    return { cents: row.baseAmount, currency: row.planCurrency };
  }
  return { cents: row.amountPaid, currency: row.currencyPaid };
}

export default function SettingsReceiptsPage() {
  const { activeOrganization } = useAuth();
  const [rows, setRows] = React.useState<OrgReceiptRow[] | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [downloadingId, setDownloadingId] = React.useState<number | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    getOrgReceipts()
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setRows([]);
          toast.error(mutationError("receipts", err, "No se pudieron cargar tus comprobantes."));
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const currencyFormat = activeOrganization?.currencyFormat;

  const handleDownload = async (row: OrgReceiptRow) => {
    if (!row.receiptNumber) return;
    setDownloadingId(row.id);
    try {
      await orgReceiptsService.download(row.id, `${row.receiptNumber}.pdf`);
    } catch (err) {
      toast.error(mutationError("receipts", err, "No se pudo descargar el comprobante."));
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <ReceiptText className="size-6 text-primary" />
          <div className="flex flex-col">
            <Title>Recibos</Title>
            <Text variant="muted" size="sm">
              Comprobantes de pago de tu suscripción a FitStack.
            </Text>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setReloadKey((key) => key + 1)}
          disabled={isLoading}
        >
          <RefreshCw className="size-4" /> Actualizar
        </Button>
      </div>

      <Card className="p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-6">
            <Text variant="muted" size="sm">
              Cargando comprobantes…
            </Text>
          </div>
        ) : !rows || rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-8 text-center">
            <ReceiptText className="size-6 text-foreground-dim" />
            <Text variant="muted" size="sm">
              Aún no tienes comprobantes disponibles.
            </Text>
          </div>
        ) : (
          <div className="divide-y divide-border-muted">
            {rows.map((row) => {
              const status = receiptStatus(row);
              const amount = displayAmount(row);
              return (
                <div
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="text-[13px] font-bold tracking-wide text-foreground">
                      {row.receiptNumber ?? "Sin comprobante"}
                      <Badge
                        variant={status.variant}
                        size="sm"
                        className="ml-2 align-middle text-[10px] uppercase tracking-widest"
                      >
                        {status.label}
                      </Badge>
                    </span>
                    <span className="truncate text-xs text-foreground-muted">
                      {row.planName} · {formatPeriod(row)} · {formatDate(row.paymentDate)}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-[13px] font-bold tabular-nums text-foreground">
                      {currencyFormat
                        ? formatCents(amount.cents, amount.currency, currencyFormat)
                        : amount.currency}
                    </span>
                    {row.receiptNumber && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={downloadingId === row.id}
                        onClick={() => handleDownload(row)}
                      >
                        <Download className="size-4" /> PDF
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

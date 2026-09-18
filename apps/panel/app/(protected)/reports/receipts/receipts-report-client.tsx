"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Download, Eye, FileWarning } from "lucide-react";
import {
  Table,
  type ColumnDef,
  Badge,
  Text,
  Button,
  Input,
  SimpleSelect,
  toast,
} from "@workspace/ui/components";
import { ReceiptDialog } from "@/components/payments/receipt-dialog";
import { financeService } from "@/lib/services/finance-service";
import { mutationError } from "@/lib/errors";
import {
  formatCents,
  type CurrencyFormat,
} from "@workspace/shared";
import {
  type IReceiptReportRow,
  type IReceiptsReportResult,
  type ISubscription,
  type ReceiptReportStatusFilter,
} from "@workspace/shared/types";

interface ReceiptsReportClientProps {
  readonly initialReport: IReceiptsReportResult;
  readonly initialPage: number;
  readonly initialTotalPages: number;
  readonly initialFilters: {
    from: string;
    to: string;
    status: ReceiptReportStatusFilter;
    method: string;
    year: string;
  };
  readonly initialCurrencyFormat: CurrencyFormat;
  readonly onSuccess?: () => Promise<void> | void;
  /** Error de filtros inválidos (visible, sin tumbar la página). */
  readonly loadError?: string | null;
}

const STATUS_OPTIONS: Array<{ value: ReceiptReportStatusFilter; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "issued", label: "Emitidos" },
  { value: "pending", label: "PDF pendiente" },
  { value: "voided", label: "Anulados" },
  { value: "pre_system", label: "Sin comprobante" },
  { value: "gaps", label: "Huecos" },
];

function stateBadge(state: IReceiptReportRow["state"]) {
  switch (state) {
    case "issued":
      return <Badge variant="success" size="sm" className="pointer-events-none">Emitido</Badge>;
    case "pending":
      return <Badge variant="warning" size="sm" className="pointer-events-none">PDF pendiente</Badge>;
    case "voided":
      return <Badge variant="destructive" size="sm" className="pointer-events-none">Anulado</Badge>;
    default:
      return <Badge variant="secondary" size="sm" className="pointer-events-none">Sin comprobante</Badge>;
  }
}

function toCsvCell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function ReceiptsReportClient({
  initialReport,
  initialPage,
  initialTotalPages,
  initialFilters,
  initialCurrencyFormat,
  onSuccess,
  loadError,
}: ReceiptsReportClientProps) {
  const router = useRouter();
  const [from, setFrom] = React.useState(initialFilters.from);
  const [to, setTo] = React.useState(initialFilters.to);
  const [status, setStatus] = React.useState<ReceiptReportStatusFilter>(initialFilters.status);
  const [method, setMethod] = React.useState(initialFilters.method);
  const [year, setYear] = React.useState(initialFilters.year);
  const [isExporting, setIsExporting] = React.useState(false);

  const refreshAll = React.useCallback(async () => {
    await onSuccess?.();
    router.refresh();
  }, [router, onSuccess]);

  const buildParams = (page: string) => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (status !== "all") params.set("status", status);
    if (method.trim()) params.set("method", method.trim());
    if (year.trim()) params.set("year", year.trim());
    params.set("page", page);
    return params;
  };

  const applyFilters = () => {
    router.push(`/reports/receipts?${buildParams("1").toString()}`);
  };

  const navigatePage = (newPage: number) => {
    router.push(`/reports/receipts?${buildParams(String(newPage)).toString()}`);
  };

  const handleExportCsv = async () => {
    setIsExporting(true);
    try {
      const full = await financeService.getReceiptsReport({
        from: from || undefined,
        to: to || undefined,
        status,
        method: method.trim() || undefined,
        year: year.trim() ? Number(year.trim()) : undefined,
        page: 1,
        limit: 1000,
      });
      // En vista de huecos se exporta lo visible (gaps), no filas vacías.
      // Montos en centavos enteros (convención Money): headers *_cents.
      const header =
        status === "gaps"
          ? ["tipo", "comprobante", "motivo", "actor", "fecha"]
          : [
              "comprobante",
              "estado",
              "miembro",
              "plan",
              "subtotal_cents",
              "impuestos_cents",
              "total_cents",
              "moneda",
              "metodo",
              "fecha_pago",
              "fecha_emision",
              "anulado",
              "motivo_anulacion",
              "motivo_override",
              "emisor",
              "emitido_por",
            ];
      const lines =
        status === "gaps"
          ? full.gaps.map((gap) =>
              [
                gap.kind,
                gap.receiptNumber,
                gap.voidReason ?? "",
                gap.voidedBy ?? "",
                gap.voidedAt ?? "",
              ]
                .map(toCsvCell)
                .join(","),
            )
          : full.rows.map((row) =>
              [
                row.receiptNumber ?? "SIN COMPROBANTE",
                row.state,
                row.memberName,
                row.planName,
                row.subtotal ?? "",
                row.taxTotal ?? "",
                row.amountPaid,
                row.currencyPaid,
                row.paymentMethod,
                row.paymentDate,
                row.receiptIssuedAt ?? "",
                row.voided ? "SI" : "NO",
                row.voidReason ?? "",
                row.taxOverrideReason ?? "",
                // C1/C5: emisor congelado + actor (libro exportable).
                row.emitterName ?? "",
                row.issuedBy ?? "",
              ]
                .map(toCsvCell)
                .join(","),
            );
      const blob = new Blob([[header.map(toCsvCell).join(","), ...lines].join("\n")], {
        type: "text/csv;charset=utf-8",
      });
      const url = window.URL.createObjectURL(blob);
      try {
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", "comprobantes.csv");
        document.body.appendChild(link);
        link.click();
        link.remove();
      } finally {
        window.URL.revokeObjectURL(url);
      }
      toast.success("Reporte exportado");
    } catch (err) {
      toast.error(mutationError("ReceiptsReport", err, "No se pudo exportar el reporte"));
    } finally {
      setIsExporting(false);
    }
  };

  const columns: ColumnDef<IReceiptReportRow>[] = [
    {
      header: "Comprobante",
      className: "pl-6",
      headerClassName: "pl-6",
      cell: (row) => (
        <div className="flex flex-col gap-1">
          <Text weight="bold" size="sm" className="font-mono">
            {row.receiptNumber ?? "SIN COMPROBANTE"}
          </Text>
          {stateBadge(row.state)}
        </div>
      ),
    },
    {
      header: "Miembro / Plan",
      cell: (row) => (
        <div className="flex flex-col gap-0.5">
          <Text weight="bold" size="sm">{row.memberName}</Text>
          <Text size="xs" variant="muted">{row.planName}</Text>
        </div>
      ),
    },
    {
      header: "Total",
      cell: (row) => (
        <div className="flex flex-col gap-0.5">
          <Text weight="bold" size="sm" className="tabular-nums">
            {formatCents(row.amountPaid, row.currencyPaid, initialCurrencyFormat)}
          </Text>
          <Text size="xs" variant="muted" className="uppercase">{row.paymentMethod}</Text>
        </div>
      ),
    },
    {
      header: "Auditoría",
      cell: (row) => (
        <div className="flex flex-col gap-0.5">
          {row.taxOverrideReason && (
            <Text size="xs" variant="muted" className="italic">
              Override: {row.taxOverrideReason}
            </Text>
          )}          {row.voided && (
            <Text size="xs" variant="muted" className="italic">
              Anulado{row.voidReason ? `: ${row.voidReason}` : ""}
            </Text>
          )}
          {row.issuedBy && (
            <Text size="xs" variant="muted">
              Emitido por: {row.issuedBy}
            </Text>
          )}
          {!row.taxOverrideReason && !row.voided && !row.issuedBy && (
            <Text size="xs" variant="muted" className="opacity-50">
              —
            </Text>
          )}
        </div>
      ),
    },
    {
      header: "Acciones",
      className: "pr-6 text-right",
      headerClassName: "pr-6 text-right",
      cell: (row) =>
        row.paymentId ? (
          <div className="flex justify-end">
            <ReceiptDialog
              initialData={
                {
                  paymentId: row.paymentId,
                  paymentStatus: row.paymentStatus,
                  memberEmail: row.memberEmail,
                  memberName: row.memberName,
                } as unknown as ISubscription
              }
              onSuccess={refreshAll}
              trigger={
                <Button variant="outlined" size="sm" leftIcon={<Eye size={14} />}>
                  Ver
                </Button>
              }
            />
          </div>
        ) : null,
    },
  ];

  return (
    <div className="flex flex-col gap-8">
      {loadError && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <Text size="sm" weight="bold" className="text-destructive">{loadError}</Text>
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <Text size="xs" variant="muted" uppercase weight="bold">Emitidos</Text>
          <Text size="lg" weight="bold" className="tabular-nums">{initialReport.summary.issued}</Text>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <Text size="xs" variant="muted" uppercase weight="bold">PDF pendiente</Text>
          <Text size="lg" weight="bold" className="tabular-nums">{initialReport.summary.pending}</Text>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <Text size="xs" variant="muted" uppercase weight="bold">Anulados</Text>
          <Text size="lg" weight="bold" className="tabular-nums">{initialReport.summary.voided}</Text>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <Text size="xs" variant="muted" uppercase weight="bold">Sin comprobante</Text>
          <Text size="lg" weight="bold" className="tabular-nums">{initialReport.summary.preSystem}</Text>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <Text weight="bold" size="sm" uppercase>Totales por moneda (emitidos)</Text>
        {initialReport.totals.length === 0 && (
          <Text size="xs" variant="muted" className="italic">Sin movimientos en el rango.</Text>
        )}
        {initialReport.totals.map((total) => (
          <div key={total.currency} className="flex flex-col gap-1 border-t border-border/50 pt-2">
            <div className="flex justify-between items-center">
              <Text size="sm" weight="bold" className="uppercase">{total.currency}</Text>
              <Text size="sm" weight="bold" className="tabular-nums">
                {formatCents(total.amount, total.currency, initialCurrencyFormat)}
              </Text>
            </div>
            {total.byTax.map((tax) => (
              <div key={`${total.currency}-${tax.name}`} className="flex justify-between items-center">
                <Text size="xs" variant="muted">{tax.name}</Text>
                <Text size="xs" variant="muted" className="tabular-nums">
                  {formatCents(tax.amount, total.currency, initialCurrencyFormat)}
                </Text>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="flex flex-col md:flex-row gap-3 md:items-end">
        <Input
          id="receipts-from"
          type="date"
          label="Desde"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <Input
          id="receipts-to"
          type="date"
          label="Hasta"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
        <SimpleSelect
          label="Estado"
          value={status}
          onChange={(value) => setStatus(value as ReceiptReportStatusFilter)}
          options={STATUS_OPTIONS}
        />
        <Input
          id="receipts-method"
          label="Método"
          placeholder="transferencia"
          value={method}
          onChange={(e) => setMethod(e.target.value)}
        />
        <Input
          id="receipts-year"
          label="Año"
          placeholder="2026"
          value={year}
          onChange={(e) => setYear(e.target.value)}
        />
        <div className="flex gap-2">
          <Button size="sm" onClick={applyFilters}>Filtrar</Button>
          <Button
            size="sm"
            variant="outlined"
            loading={isExporting}
            onClick={() => void handleExportCsv()}
            leftIcon={<Download size={16} />}
            title="Exporta hasta 1000 filas con los filtros actuales"
          >
            CSV
          </Button>
        </div>
      </div>

      <Table
        className="min-h-[400px]"
        columns={columns}
        data={initialReport.rows}
        // En vista de huecos no hay filas paginables: se oculta la paginación.
        pagination={
          status === "gaps"
            ? undefined
            : {
                page: initialPage,
                totalPages: initialTotalPages,
                total: initialReport.total,
                limit: 20,
                onPageChange: navigatePage,
              }
        }
        emptyState={
          <div className="py-20 w-full flex flex-col items-center gap-2">
            <FileWarning size={24} className="opacity-40" />
            <Text variant="muted">Sin comprobantes para los filtros indicados.</Text>
          </div>
        }
      />

      {initialReport.gaps.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <Text weight="bold" size="sm" uppercase>Auditoría del correlativo</Text>
          {initialReport.gaps.map((gap) => (
            <div
              key={gap.receiptNumber}
              className="flex flex-col md:flex-row md:items-center gap-1 md:gap-3 border-t border-border/50 pt-2"
            >
              {gap.kind === "hueco" ? (
                <Badge variant="destructive" size="sm" className="pointer-events-none w-fit">
                  Hueco sospechoso
                </Badge>
              ) : (
                <Badge variant="secondary" size="sm" className="pointer-events-none w-fit">
                  Anulado
                </Badge>
              )}
              <Text size="sm" weight="bold" className="font-mono">{gap.receiptNumber}</Text>
              {gap.kind === "anulado" && (
                <Text size="xs" variant="muted" className="italic">
                  {gap.voidReason ?? "Sin motivo registrado"}
                  {gap.voidedBy ? ` · por ${gap.voidedBy}` : ""}
                </Text>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

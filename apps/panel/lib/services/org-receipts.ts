import { api, apiBlob, type ApiFetchOptions } from "@/lib/api/client";
import type { ReceiptData } from "@workspace/shared";

/**
 * A SaaS (`FS-N`) payment of the active organization, as returned by
 * `GET /api/organizations/receipts`. Read-only and strictly org-scoped:
 * the platform keeps its own global audit in console.
 * Money values are integer cents.
 */
export interface OrgReceiptRow {
  readonly id: number;
  /** `FS-0000001`; `null` = pre-system (never numbered). */
  readonly receiptNumber: string | null;
  /** ANULADO receipt: not valid income, but the number is never reused. */
  readonly receiptVoided: boolean;
  readonly receiptIssuedAt: string | null;
  readonly status: string;
  readonly planName: string;
  readonly planCurrency: string;
  readonly planDurationValue: number;
  readonly planDurationUnit: string;
  readonly amountPaid: number;
  readonly currencyPaid: string;
  /** Integer cents in the platform base currency; `null` on legacy rows. */
  readonly baseAmount: number | null;
  readonly paymentMethod: string;
  readonly paymentDate: string;
}

/**
 * 3-state contract of `GET /api/organizations/receipts/:paymentId`
 * (mirror of the gym contract, never 409):
 * - ready: number + composed receipt + downloadable PDF.
 * - pending (HTTP 202): numbered, PDF still rendering.
 * - pre_system: issued before the correlative system, terminal.
 */
export type OrgReceiptState =
  | {
      available: true;
      pdfStatus: "ready";
      receiptNumber: string;
      receipt: ReceiptData;
      pdfUrl: string;
    }
  | { available: true; pdfStatus: "pending"; receiptNumber: string }
  | { available: false; reason: "pre_system" };

/** Server or client: the API client forwards cookies in both runtimes. */
export async function getOrgReceipts(
  options?: ApiFetchOptions,
): Promise<OrgReceiptRow[]> {
  const data = await api<{ payments: OrgReceiptRow[] }>(
    "/organizations/receipts",
    options,
  );
  return data.payments;
}

/**
 * Single access point from the panel to the SaaS receipt endpoints.
 * Errors are thrown so the caller can apply
 * `mutationError(scope, err, "<generic>")` + toast (never raw text).
 */
export const orgReceiptsService = {
  /** Current state of one receipt (3-state contract). */
  async getState(paymentId: number): Promise<OrgReceiptState> {
    return await api<OrgReceiptState>(`/organizations/receipts/${paymentId}`);
  },

  /**
   * Only when `pdfStatus === "ready"`. Client-only (`window`): `apiBlob`
   * relies on the browser cookie jar.
   */
  async download(paymentId: number, filename: string): Promise<void> {
    const blob = await apiBlob<Blob>(`/organizations/receipts/${paymentId}/pdf`);
    const url = window.URL.createObjectURL(blob);
    try {
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } finally {
      window.URL.revokeObjectURL(url);
    }
  },
};

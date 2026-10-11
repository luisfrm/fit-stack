"use client";

import {
  Button,
  Text,
} from "@workspace/ui/components";
import { ExternalLink } from "lucide-react";

import { uploadService } from "@/lib/services/upload-service";
import { maskReference } from "@workspace/shared";

export interface ReceiptPaymentDetail {
  label: string;
  value: string | number;
  /** `file` (screenshot) o cualquier otro string (`text`, `number`, …). */
  type?: string;
}

export type PaymentMethodDetailsInput =
  | ReceiptPaymentDetail[]
  | Record<string, unknown>
  | null
  | undefined;

interface NormalizedDetail {
  label: string;
  value: string;
  isImage: boolean;
  /** Used as React key when normalizing arrays; stable identifier for fragments. */
  key: string;
}

function isImageUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  if (value.startsWith("http") || value.startsWith("/")) return true;
  // Relative keys without type (e.g., `org/capturas/abc.png`): evidence, not a secret.
  return value.includes("/") || /\.(png|jpe?g|webp|gif|pdf)$/i.test(value);
}

/**
 * Flattens `paymentMethodDetails` into a unified format for rendering. Accepts
 * the new format (`IPaymentMethodDetail[]`) and the legacy format (`Record<string, any>`)
 * while both coexist in the DB.
 *
 * `text`/`number` values are masked (`maskReference` from shared) in
 * BOTH formats; `file` (or evidence URL/key) remains as a link
 * "VER CAPTURA" (it is evidence, not a secret).
 */
export function normalizePaymentDetails(
  input: PaymentMethodDetailsInput,
): NormalizedDetail[] {
  if (!input) return [];
  if (Array.isArray(input)) {
    return input.map((detail, idx) => {
      // The type of `detail` is union (shared IPaymentMethodDetail + our ReceiptPaymentDetail);
      // coercion is safe because we only read `label`, `value`, and an optional `type`.
      // `value` can be `number` (schema allows `type: "number"`): String() before masking.
      const d = detail as ReceiptPaymentDetail;
      const isImage =
        d.type === "file" ||
        (d.type === undefined && isImageUrl(d.value));
      return {
        label: d.label,
        value: isImage ? String(d.value) : maskReference(String(d.value ?? "")),
        isImage,
        key: `${d.label}-${idx}`,
      };
    });
  }

  return Object.entries(input).flatMap(([key, value]) => {
    if (value === null || value === undefined || value === "" || key === "last4") return [];
    if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") return [];
    const strValue = `${value}`;
    const isImage = isImageUrl(value);
    return [
      {
        label: key.replaceAll("_", " ").toUpperCase(),
        value: isImage ? strValue : maskReference(strValue),
        isImage,
        key,
      },
    ];
  });
}

interface PaymentDetailRowProps {
  readonly detail: NormalizedDetail;
}

export function PaymentDetailRow({ detail }: PaymentDetailRowProps) {
  return (
    <div className="flex justify-between items-center gap-4 py-0.5">
      <Text className="label-text">{detail.label}</Text>
      {detail.isImage ? (
        <Button variant="link" size="xs" asChild className="h-auto p-0 text-primary">
          <a href={uploadService.getMediaUrl(detail.value)} target="_blank" rel="noopener noreferrer">
            VER CAPTURA <ExternalLink size={10} className="ml-1" />
          </a>
        </Button>
      ) : (
        <Text className="mono-text opacity-60">{detail.value}</Text>
      )}
    </div>
  );
}

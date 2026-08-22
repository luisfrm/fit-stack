"use client";

import {
  Button,
  Text,
} from "@workspace/ui/components";
import { ExternalLink } from "lucide-react";

import { uploadService } from "@/lib/services/upload-service";

export interface ReceiptPaymentDetail {
  label: string;
  value: string;
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
  return typeof value === "string" && (value.startsWith("http") || value.startsWith("/"));
}

/**
 * Aplana `paymentMethodDetails` a un formato único para renderizar. Acepta
 * el formato nuevo (`IPaymentMethodDetail[]`) y el legacy (`Record<string, any>`)
 * mientras conviven las dos formas en la BD.
 */
export function normalizePaymentDetails(
  input: PaymentMethodDetailsInput,
): NormalizedDetail[] {
  if (!input) return [];
  if (Array.isArray(input)) {
    return input.map((detail, idx) => {
      // El tipo de `detail` es union (shared IPaymentMethodDetail + nuestro ReceiptPaymentDetail);
      // la coerción es segura porque solo leemos `label`, `value` y un `type` opcional.
      const d = detail as ReceiptPaymentDetail;
      return {
        label: d.label,
        value: d.value,
        isImage:
          d.type === "file" ||
          (d.type === undefined && isImageUrl(d.value)),
        key: `${d.label}-${idx}`,
      };
    });
  }

  return Object.entries(input).flatMap(([key, value]) => {
    if (!value || key === "last4") return [];
    return [
      {
        label: key.replaceAll("_", " ").toUpperCase(),
        value: String(value),
        isImage: isImageUrl(value),
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
            VER CAPTURE <ExternalLink size={10} className="ml-1" />
          </a>
        </Button>
      ) : (
        <Text className="mono-text opacity-60">{detail.value}</Text>
      )}
    </div>
  );
}

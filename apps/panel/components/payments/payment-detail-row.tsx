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
  // Keys relativas sin type (p. ej. `org/capturas/abc.png`): evidencia, no secreto.
  return value.includes("/") || /\.(png|jpe?g|webp|gif|pdf)$/i.test(value);
}

/**
 * Aplana `paymentMethodDetails` a un formato único para renderizar. Acepta
 * el formato nuevo (`IPaymentMethodDetail[]`) y el legacy (`Record<string, any>`)
 * mientras conviven las dos formas en la BD.
 *
 * Los valores `text`/`number` se enmascaran (`maskReference` de shared) en
 * AMBAS formas; `file` (o URL/key de evidencia) sigue como link
 * "VER CAPTURA" (es evidencia, no secreto).
 */
export function normalizePaymentDetails(
  input: PaymentMethodDetailsInput,
): NormalizedDetail[] {
  if (!input) return [];
  if (Array.isArray(input)) {
    return input.map((detail, idx) => {
      // El tipo de `detail` es union (shared IPaymentMethodDetail + nuestro ReceiptPaymentDetail);
      // la coerción es segura porque solo leemos `label`, `value` y un `type` opcional.
      // `value` puede ser `number` (schema admite `type: "number"`): String() antes de enmascarar.
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
    const isImage = isImageUrl(value);
    return [
      {
        label: key.replaceAll("_", " ").toUpperCase(),
        value: isImage ? String(value) : maskReference(String(value)),
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

"use client";

import { Text } from "@workspace/ui/components";
import { ExternalLink } from "lucide-react";
import { uploadService } from "@/lib/services/upload-service";
import type { IPaymentMethodDetails } from "@workspace/shared/types";

function isImageUrl(value: unknown): boolean {
  return typeof value === "string" && (value.startsWith("http") || value.startsWith("/"));
}

interface NormalizedItem {
  label: string;
  value: string;
  isImage: boolean;
  key: string;
}

/**
 * Aplana `paymentMethodDetails` (formato nuevo `IPaymentMethodDetail[]` o
 * legacy `Record<string, any>`) y lo renderiza como lista label/valor para
 * que soporte pueda revisar el recibo: campos `file` se muestran como link
 * "VER CAPTURA" apuntando al archivo en R2.
 */
export function PaymentDetailsList({
  details,
}: {
  readonly details: IPaymentMethodDetails | Record<string, any> | null | undefined;
}) {
  if (!details) return null;

  const items: NormalizedItem[] = Array.isArray(details)
    ? details.map((d, idx) => ({
        label: d.label,
        value: d.value,
        isImage: d.type === "file" || (d.type === undefined && isImageUrl(d.value)),
        key: `${d.label}-${idx}`,
      }))
    : Object.entries(details).flatMap(([key, value]) => {
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

  return (
    <div className="flex flex-col gap-1.5 min-w-[180px] max-w-[260px]">
      {items.map((item) => (
        <div key={item.key} className="flex flex-col gap-0.5">
          <Text size="xs" variant="muted" className="uppercase tracking-wider font-bold truncate">
            {item.label}
          </Text>
          {item.isImage ? (
            <a
              href={uploadService.getMediaUrl(item.value)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-medium w-fit"
            >
              VER CAPTURA <ExternalLink size={10} />
            </a>
          ) : (
            <Text size="xs" className="font-mono opacity-80 break-all">
              {item.value}
            </Text>
          )}
        </div>
      ))}
    </div>
  );
}
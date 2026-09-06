"use client";

import * as React from "react";
import Link from "next/link";
import { User } from "lucide-react";

import { Text } from "@workspace/ui/components";
import { Badge } from "@workspace/ui/components/badge";
import { NextImage } from "@workspace/ui/components/next/image";
import { uploadService } from "@/lib/services/upload-service";

export interface MemberDeadlineItem {
  memberId: number;
  memberName: string;
  imageUrl?: string | null;
  phone?: string | null;
  email?: string | null;
  planName?: string | null;
  endDate: string;
  /** Vence en N días (positivo) o venció hace N días (negativo). */
  days: number;
}

interface MemberDeadlineRowProps {
  item: MemberDeadlineItem;
  /** Texto del badge, p. ej. "vence en 3 días" / "vencido hace 2 días". */
  badgeLabel: string;
  /** Variante del badge del design system (destructive/warning). */
  badgeVariant: "destructive" | "warning";
}

export function MemberDeadlineRow({ item, badgeLabel, badgeVariant }: Readonly<MemberDeadlineRowProps>) {
  return (
    <Link
      href="/members"
      className="flex items-center gap-3 p-3 rounded-lg hover:bg-foreground/5 transition-colors"
    >
      {item.imageUrl ? (
        <NextImage
          src={uploadService.getMediaUrl(item.imageUrl)}
          alt={item.memberName}
          width={40}
          height={40}
          containerClassName="h-10 w-10 shrink-0 rounded-full"
          className="rounded-full"
        />
      ) : (
        <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0">
          <User className="w-4 h-4" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <Text as="p" size="base" weight="medium" truncate>
          {item.memberName}
        </Text>
        {item.planName && (
          <Text as="p" size="xs" variant="muted" className="truncate">
            {item.planName}
          </Text>
        )}
      </div>
      <Badge variant={badgeVariant} size="sm" className="shrink-0">
        {badgeLabel}
      </Badge>
    </Link>
  );
}

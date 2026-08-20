"use client";

import { User, CalendarClock } from "lucide-react";

import { Text } from "@workspace/ui/components";
import { NextImage } from "@workspace/ui/components/next/image";
import { uploadService } from "@/lib/services/upload-service";
import { useSettings, SETTINGS_KEYS } from "@/lib/hooks/use-settings";
import { ValueConverter, type CurrencyFormat } from "@/lib/utils/value-converters";

interface ActivityItemProps {
  name: string;
  time?: string;
  imageUrl?: string | null;
  planName?: string;
  amountPaid?: number;
  currencyPaid?: string;
  endDate?: string;
}

export function ActivityItem({ name, time, imageUrl, planName, amountPaid, currencyPaid, endDate }: Readonly<ActivityItemProps>) {
  const { settings } = useSettings();
  const currencyFormat = (settings[SETTINGS_KEYS.CURRENCY_FORMAT] as CurrencyFormat) || "latam";

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-foreground/5 transition-colors">
      {imageUrl ? (
        <NextImage
          src={uploadService.getMediaUrl(imageUrl)}
          alt={name}
          width={48}
          height={48}
          containerClassName="h-12 w-12 shrink-0 rounded-full"
          className="rounded-full"
        />
      ) : (
        <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
          <User className="w-4 h-4" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <Text as="p" size="base" weight="medium" truncate>
          {name}
        </Text>
        {planName && (
          <Text as="p" size="xs" variant="primary" weight="semibold" className="truncate">
            {planName}
          </Text>
        )}
        <div className="flex items-center gap-2">
          {amountPaid !== undefined && (
            <Text as="span" size="xs" variant="muted" className="tabular-nums">
              {ValueConverter.format(amountPaid / 100, currencyPaid || 'USD', currencyFormat)}
            </Text>
          )}
          {endDate && (
            <Text as="span" size="xs" variant="subtle" className="flex items-center gap-0.5">
              <CalendarClock size={10} />
              {new Date(endDate).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
            </Text>
          )}
          <Text as="span" size="xs" variant="subtle" className="ml-auto uppercase">
            {time}
          </Text>
        </div>
      </div>
    </div>
  );
}
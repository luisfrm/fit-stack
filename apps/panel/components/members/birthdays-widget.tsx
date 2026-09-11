"use client";

import { Cake } from "lucide-react";
import { Card } from "@workspace/ui/components/card";
import { Text } from "@workspace/ui/components/text";
import { formatBirthdayDay } from "@/lib/members/member-stats-selectors";
import type { IMemberBirthday } from "@workspace/shared/types";

interface BirthdaysWidgetProps {
  readonly birthdays: IMemberBirthday[];
}

/**
 * Widget de próximos cumpleaños (top 5 de `GET /api/members/stats`).
 * Dominio miembro, nada de pagos.
 */
export function BirthdaysWidget({ birthdays }: Readonly<BirthdaysWidgetProps>) {
  return (
    <Card data-testid="members-birthdays" className="overflow-hidden pb-0 flex flex-col">
      <div className="p-6 pb-4 border-b border-border">
        <Text as="p" size="lg" weight="bold">Próximos cumpleaños</Text>
        <Text as="p" size="xs" variant="muted" className="mt-1">
          Celebra con tus clientes.
        </Text>
      </div>
      <div className="flex-1 min-h-0 p-4">
        {birthdays.length === 0 ? (
          <div className="flex h-full min-h-24 items-center justify-center text-muted-foreground text-sm font-medium">
            Sin cumpleaños registrados.
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {birthdays.map((b) => (
              <li
                key={b.id}
                className="birthday-row flex items-center gap-3 rounded-lg border border-white/5 bg-white/5 px-3 py-2"
              >
                <Cake className="w-4 h-4 text-primary shrink-0" />
                <span className="flex-1 min-w-0 truncate text-sm text-slate-200 font-medium">
                  {b.firstName} {b.lastName}
                </span>
                <span className="text-xs text-slate-400 font-medium shrink-0">
                  {formatBirthdayDay(b.birthday)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

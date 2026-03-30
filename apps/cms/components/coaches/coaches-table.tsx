"use client";

import * as React from "react";
import { type ICoach } from "@/types/dashboard";
import { NoData } from "../dashboard/dashboard-ui";
import { Avatar, AvatarFallback, AvatarImage } from "@workspace/ui/components/avatar";
import { Text } from "@workspace/ui/components/text";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table";
import { Button } from "@workspace/ui/components/button";
import { Pencil, Trash2 } from "lucide-react";

interface CoachesTableProps {
  coaches: ICoach[];
  onEdit: (coach: ICoach) => void;
  onDelete: (coach: ICoach) => void;
}

export function CoachesTable({ coaches, onEdit, onDelete }: CoachesTableProps) {
  if (coaches.length === 0) {
    return <NoData message="No hay entrenadores registrados." className="py-20" />;
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader className="bg-white/5 border-b-0">
          <TableRow className="border-border-dark hover:bg-transparent">
            {["Entrenador", "Especialidades", "Estado", "Acciones"].map((h) => (
              <TableHead key={h} className="px-6 py-4 text-slate-400 font-semibold text-xs uppercase tracking-wider">
                {h}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody className="divide-y divide-border-dark">
          {coaches.map((coach) => (
            <TableRow key={coach.id} className="hover:bg-white/2 transition-colors border-border-dark">
              {/* Entrenador */}
              <TableCell className="px-6 py-4">
                <div className="flex items-center gap-3">
                  <Avatar size="default">
                    {coach.imageUrl && <AvatarImage src={coach.imageUrl} alt={coach.name} />}
                    <AvatarFallback>{coach.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col min-w-0">
                    <Text as="span" size="base" weight="medium" truncate>
                      {coach.name}
                    </Text>
                    <Text as="span" size="xs" variant="subtle" truncate>
                      {coach.role}
                    </Text>
                  </div>
                </div>
              </TableCell>

              {/* Especialidades */}
              <TableCell className="px-6 py-4">
                <Text as="span" size="sm" variant="muted">
                  {coach.specialities && coach.specialities.length > 0 
                    ? coach.specialities.join(", ") 
                    : "Ninguna"}
                </Text>
              </TableCell>

              {/* Estado */}
              <TableCell className="px-6 py-4">
                {coach.isVisible ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/20 text-emerald-400">
                    Visible
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-500/20 text-slate-400">
                    Oculto
                  </span>
                )}
              </TableCell>

              {/* Acciones */}
              <TableCell className="px-6 py-4 text-right">
                <div className="flex items-center gap-2">
                   <Button variant="ghost" size="icon" onClick={() => onEdit(coach)}>
                    <Pencil size={16} className="text-slate-400" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => onDelete(coach)}>
                    <Trash2 size={16} className="text-rose-400" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

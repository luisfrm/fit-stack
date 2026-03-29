"use client";

import * as React from "react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Badge,
  Button,
  Text,
} from "@workspace/ui/components";
import { type ICmsClass } from "@/types/dashboard";
import { Edit2, Trash2, Eye, EyeOff, Calendar } from "lucide-react";
import { ClassModal } from "./class-modal";

interface ClassesTableProps {
  readonly classes: ICmsClass[];
  readonly onDelete?: (id: number) => void;
  readonly onUpdate?: () => void;
}

export function ClassesTable({ classes, onDelete, onUpdate }: ClassesTableProps) {
  if (classes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 text-center bg-white/5 rounded-xl border border-dashed border-white/10">
        <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
          <Calendar className="text-white/20 w-8 h-8" />
        </div>
        <Text as="p" size="lg" weight="bold" className="text-slate-200">No hay clases registradas</Text>
        <Text variant="muted" className="max-w-xs mt-1">
          Comienza creando tu primera clase para que aparezca en la lista y en la App.
        </Text>
      </div>
    );
  }

  return (
    <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
      <Table>
        <TableHeader className="bg-white/5">
          <TableRow>
            <TableHead className="py-4 pl-6 text-white/50 uppercase text-[10px] tracking-widest font-bold">Clase</TableHead>
            <TableHead className="py-4 text-white/50 uppercase text-[10px] tracking-widest font-bold">Horario</TableHead>
            <TableHead className="py-4 text-white/50 uppercase text-[10px] tracking-widest font-bold">Entrenador</TableHead>
            <TableHead className="py-4 text-white/50 uppercase text-[10px] tracking-widest font-bold">Estado</TableHead>
            <TableHead className="py-4 pr-6 text-right text-white/50 uppercase text-[10px] tracking-widest font-bold">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {classes.map((cls) => (
            <TableRow key={cls.id} className="group hover:bg-white/5 transition-colors border-white/5">
              <TableCell className="py-4 pl-6">
                <div className="flex flex-col">
                  <Text weight="bold" className="text-slate-100 group-hover:text-primary transition-colors">
                    {cls.name}
                  </Text>
                  {cls.description && (
                    <Text size="xs" variant="muted" className="line-clamp-1 max-w-[200px]">
                      {cls.description}
                    </Text>
                  )}
                </div>
              </TableCell>
              <TableCell className="py-4">
                <Text size="sm" className="text-slate-300">{cls.timeInfo}</Text>
              </TableCell>
              <TableCell className="py-4">
                <Text size="sm" className="text-slate-300">{cls.trainerName || "Sin asignar"}</Text>
              </TableCell>
              <TableCell className="py-4">
                <Badge 
                  variant="outline"
                  className={cls.isVisible ? "bg-primary/20 text-primary border-primary/20" : "bg-slate-500/20 text-slate-400 border-slate-500/20"}
                >
                  <div className="flex items-center gap-1.5 font-normal">
                    {cls.isVisible ? <Eye size={12} /> : <EyeOff size={12} />}
                    {cls.isVisible ? "Visible" : "Oculta"}
                  </div>
                </Badge>
              </TableCell>
              <TableCell className="py-4 pr-6 text-right">
                <div className="flex justify-end gap-2">
                  <ClassModal 
                    classData={cls}
                    onSuccess={onUpdate}
                    trigger={
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-white/10 text-slate-400 hover:text-white">
                        <Edit2 size={14} />
                      </Button>
                    }
                  />
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-8 w-8 p-0 hover:bg-red-500/10 text-slate-400 hover:text-red-500"
                    onClick={() => cls.id && onDelete?.(cls.id)}
                  >
                    <Trash2 size={14} />
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

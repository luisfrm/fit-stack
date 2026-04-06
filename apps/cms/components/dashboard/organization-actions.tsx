"use client";

import * as React from "react";
import { 
  ArrowUpRight, 
  Settings, 
  MoreHorizontal, 
  Edit2, 
  Power 
} from "lucide-react";
import { 
  Button, 
  DropdownMenu, 
  DropdownMenuTrigger, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator 
} from "@workspace/ui/components";

interface OrganizationActionsProps {
  readonly status: 'active' | 'inactive' | 'pending';
  readonly onActivate?: () => void;
  readonly onEdit?: () => void;
  readonly onSettings?: () => void;
  readonly onToggleStatus?: () => void;
}

export function OrganizationActions({ status, onActivate, onEdit, onSettings, onToggleStatus }: OrganizationActionsProps) {
  return (
    <div className="flex items-center justify-end gap-1">
      <Button 
        variant="ghost" 
        size="icon" 
        title="Activar Contexto" 
        className="text-primary hover:bg-primary/10"
        onClick={onActivate}
      >
        <ArrowUpRight size={18} />
      </Button>
      <Button 
        variant="ghost" 
        size="icon" 
        title="Configuración"
        onClick={onSettings}
      >
        <Settings size={18} className="text-gray-400" />
      </Button>
      
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon">
            <MoreHorizontal size={18} className="text-gray-500" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel>Gestión</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="gap-2" onClick={onEdit}>
            <Edit2 size={14} /> Editar Información
          </DropdownMenuItem>
          <DropdownMenuItem 
            className="gap-2 text-amber-500 hover:text-amber-600"
            onClick={onToggleStatus}
          >
            <Power size={14} /> {status === 'active' ? 'Desactivar Acceso' : 'Activar Acceso'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

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
  DropdownMenuSeparator,
  toast
} from "@workspace/ui/components";
import { useRouter } from "next/navigation";
import { sessionService } from "@/lib/services/session-service";
import { organizationsService } from "@/lib/services/organizations-service";

interface OrganizationActionsProps {
  readonly organizationId: string;
  readonly status: 'active' | 'inactive' | 'pending';
  readonly onActivate?: () => void;
  readonly onEdit?: () => void;
  readonly onSettings?: () => void;
  readonly onToggleStatus?: () => void;
}

export function OrganizationActions({ organizationId, status, onActivate, onEdit, onSettings, onToggleStatus }: OrganizationActionsProps) {
  const [isActivating, setIsActivating] = React.useState(false);
  const router = useRouter();

  const handleActivate = async () => {
    setIsActivating(true);
    try {
      if (onActivate) {
        onActivate();
        return;
      }

      const { error } = await sessionService.setActiveOrganization(organizationId);

      if (error) {
        // If the user is a global admin but not a member, we auto-join them
        if (error.code === "USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION") {
          toast.info("Vinculando perfil de administrador...");

          try {
            await organizationsService.join(organizationId);

            // Retry activation after joining
            const { error: retryError } = await sessionService.setActiveOrganization(organizationId);
            if (retryError) throw new Error(retryError.message);

            toast.success("Perfil vinculado y contexto activado");
            router.refresh();
            return;
          } catch (joinErr: any) {
            console.error("Failed to auto-join organization:", joinErr);
          }
        }

        toast.error(error.message || "Error al cambiar de organización");
        console.error("Error activating organization:", error);

        return;
      }

      toast.success("Contexto activado correctamente");
      router.refresh();
    } catch (err: any) {
      console.error("Error activating organization:", err);
      toast.error("Error crítico al establecer contexto");
    } finally {
      setIsActivating(false);
    }
  };

  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        variant="ghost"
        size="icon"
        title="Activar Contexto"
        className="text-primary hover:bg-primary/10"
        onClick={handleActivate}
        loading={isActivating}
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

"use client";

import * as React from "react";
import { Users, Mail, RefreshCw, CheckCircle2, Clock, UserPlus } from "lucide-react";
import { Card, Text, Button, Badge, toast } from "@workspace/ui/components";
import { organizationsService } from "@/lib/services/organizations-service";
import { ProvisionOwnerModal } from "./provision-owner-modal";
import type { IMember } from "@workspace/shared/types";

interface OrganizationStaffCardProps {
  readonly organizationId: string;
}

export function OrganizationStaffCard({ organizationId }: OrganizationStaffCardProps) {
  const [staff, setStaff] = React.useState<IMember[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [resendingId, setResendingId] = React.useState<number | null>(null);

  const fetchStaff = React.useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await organizationsService.getStaff(organizationId);
      setStaff(data);
    } catch (error) {
      console.error("Error loading organization staff:", error);
      toast.error("No se pudo cargar el personal de la organización");
    } finally {
      setIsLoading(false);
    }
  }, [organizationId]);

  React.useEffect(() => {
    if (organizationId) {
      fetchStaff();
    }
  }, [organizationId, fetchStaff]);

  const handleResendInvite = async (member: IMember) => {
    if (!member.id) return;
    setResendingId(member.id);
    try {
      await organizationsService.resendStaffInvite(organizationId, member.id);
      toast.success(`Invitación reenviada a ${member.email}`);
      await fetchStaff();
    } catch (error: any) {
      console.error("Error resending invite:", error);
      const rawError = error?.data?.error ?? error?.message;
      let msg = "Ocurrió un error al reenviar la invitación";
      if (rawError === "El usuario ya tiene una cuenta vinculada") {
        msg = "Este miembro ya tiene una cuenta vinculada a la plataforma.";
      } else if (rawError === "Member not found" || rawError === "Miembro no encontrado") {
        msg = "Miembro no encontrado en esta organización.";
      }
      toast.error(msg);
    } finally {
      setResendingId(null);
    }
  };

  const hasOwner = staff.some((member) => member.role === "owner");

  return (
    <Card className="p-6 space-y-6 bg-card border-border shadow-sm rounded-xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">
              Personal y Propietarios
            </h3>
            <Text className="text-xs text-muted-foreground">
              Usuarios y roles asignados a esta sede. Puedes reenviar invitaciones pendientes.
            </Text>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!hasOwner && (
            <ProvisionOwnerModal
              organizationId={organizationId}
              onSuccess={fetchStaff}
              trigger={
                <Button size="sm" className="gap-2 text-xs font-semibold">
                  <UserPlus className="w-3.5 h-3.5" />
                  Agregar Propietario
                </Button>
              }
            />
          )}
          <Button
            variant="outlined"
            size="sm"
            onClick={fetchStaff}
            disabled={isLoading}
            className="gap-2 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            Actualizar
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          Cargando personal...
        </div>
      ) : staff.length === 0 ? (
        <div className="py-10 text-center space-y-4 border border-dashed border-border rounded-xl bg-card/30 p-6">
          <div className="w-12 h-12 mx-auto rounded-full bg-primary/10 flex items-center justify-center text-primary">
            <Users className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-medium text-foreground">Sin propietarios ni personal registrados</h4>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              Esta sede aún no tiene un usuario propietario asignado. Agrega un propietario para enviarle su invitación.
            </p>
          </div>
          <ProvisionOwnerModal
            organizationId={organizationId}
            onSuccess={fetchStaff}
            trigger={
              <Button size="sm" className="gap-2 text-xs font-semibold">
                <UserPlus className="w-4 h-4" />
                Agregar Propietario
              </Button>
            }
          />
        </div>
      ) : (
        <div className="divide-y divide-border border rounded-lg overflow-hidden">
          {staff.map((member) => {
            const isLinked = Boolean(member.userId || member.user?.id);
            const isResending = resendingId === member.id;

            return (
              <div
                key={member.id ?? member.email}
                className="flex items-center justify-between p-4 bg-card/50 hover:bg-muted/30 transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-foreground">
                      {member.firstName} {member.lastName}
                    </span>
                    <Badge variant="outline" className="text-[10px] uppercase font-mono px-2 py-0.5">
                      {member.role || "Member"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Mail className="w-3.5 h-3.5" />
                    <span>{member.email}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {isLinked ? (
                    <Badge variant="success" className="gap-1.5 py-1 px-2.5 text-xs">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Vinculado
                    </Badge>
                  ) : (
                    <Badge variant="warning" className="gap-1.5 py-1 px-2.5 text-xs">
                      <Clock className="w-3.5 h-3.5" />
                      Invitación Pendiente
                    </Badge>
                  )}

                  {!isLinked && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleResendInvite(member)}
                      disabled={isResending}
                      className="gap-1.5 text-xs"
                    >
                      <Mail className={`w-3.5 h-3.5 ${isResending ? "animate-pulse" : ""}`} />
                      {isResending ? "Enviando..." : "Reenviar Invitación"}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

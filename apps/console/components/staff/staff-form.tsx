"use client";

import * as React from "react";
import { Input, Button, toast, SimpleSelect, CheckboxCard } from "@workspace/ui/components";
import { Mail, User as UserIcon, Send, ShieldCheck } from "lucide-react";
import {
  canAssignPlatformRole,
  platformRoles,
  PLATFORM_ROLE_LABELS,
  type PlatformRole,
} from "@workspace/shared";
import { useAuth } from "@/lib/hooks/use-auth";
import type { CreateStaffInput } from "@/lib/services/staff-service";

const ROLE_OPTIONS = Object.keys(platformRoles).map((role) => ({
  value: role,
  label: PLATFORM_ROLE_LABELS[role] ?? role,
}));

interface StaffFormProps {
  readonly onSubmit: (data: CreateStaffInput) => Promise<void>;
  readonly isLoading?: boolean;
}

export function StaffForm({ onSubmit, isLoading }: StaffFormProps) {
  const { user } = useAuth();
  const actorRole = (user?.role || "user") as PlatformRole;

  const [formData, setFormData] = React.useState<CreateStaffInput>({
    name: "",
    email: "",
    role: "admin",
    sendInvite: true,
  });

  // Anti-escalation: only show roles the actor may assign
  // (owner → any; admin → support/admin; support → none)
  const assignableRoles = ROLE_OPTIONS.filter((opt) =>
    canAssignPlatformRole(actorRole, opt.value as PlatformRole),
  );

  const handleChange = (field: keyof CreateStaffInput, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (assignableRoles.length === 0) {
      toast.error("Tu rol no permite asignar administradores de plataforma.");
      return;
    }

    try {
      await onSubmit({
        name: formData.name?.trim() || undefined,
        email: formData.email.trim(),
        role: formData.role,
        sendInvite: formData.sendInvite,
      });
    } catch (error: any) {
      toast.error(error?.data?.error ?? error?.message ?? "Algo salió mal");
    }
  };

  if (assignableRoles.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <ShieldCheck className="size-10 text-foreground-dim" />
        <p className="text-sm text-foreground-muted">
          Tu rol no permite asignar administradores de plataforma.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5 py-4">
      <div className="grid grid-cols-1 gap-4">
        <Input
          label="Nombre (opcional)"
          placeholder="Ej: María González"
          value={formData.name ?? ""}
          onChange={(e) => handleChange("name", e.target.value)}
          leftIcon={<UserIcon size={16} />}
        />

        <Input
          label="Correo Electrónico"
          type="email"
          placeholder="Ej: maria@fitstack.com"
          value={formData.email}
          onChange={(e) => handleChange("email", e.target.value)}
          required
          leftIcon={<Mail size={16} />}
        />

        <SimpleSelect
          label="Rol de Plataforma"
          value={formData.role}
          onChange={(val) => handleChange("role", val)}
          options={assignableRoles}
        />
      </div>

      <div className="col-span-full flex flex-col gap-3 pt-2">
        <CheckboxCard
          id="sendInviteStaff"
          checked={formData.sendInvite}
          onCheckedChange={(checked) => handleChange("sendInvite", !!checked)}
          label="Enviar correo de registro"
          description={
            formData.sendInvite
              ? "Si el usuario no existe aún, recibirá un enlace para activar su cuenta en FitStack Console."
              : "Solo se otorgará acceso a usuarios que ya existen en la plataforma."
          }
          className="border-primary/10 bg-primary/5 hover:bg-primary/10"
        />
      </div>

      <div className="pt-4">
        <Button
          type="submit"
          fullWidth
          size="lg"
          loading={isLoading}
          rightIcon={!isLoading && <Send size={18} />}
        >
          AGREGAR ADMINISTRADOR
        </Button>
      </div>
    </form>
  );
}

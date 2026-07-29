"use client";

import * as React from "react";
import { UserPlus } from "lucide-react";
import { Modal, Input, Button, toast } from "@workspace/ui/components";
import { CheckboxCard } from "@workspace/ui/components/checkbox-card";
import { ORG_ROLES } from "@workspace/shared/constants";
import { organizationsService } from "@/lib/services/organizations-service";

interface ProvisionOwnerModalProps {
  readonly organizationId: string;
  readonly trigger: React.ReactNode;
  readonly onSuccess?: () => void;
}

export function ProvisionOwnerModal({
  organizationId,
  trigger,
  onSuccess,
}: ProvisionOwnerModalProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);

  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [sendInvite, setSendInvite] = React.useState(true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      toast.error("Por favor completa el nombre, apellido y correo electrónico");
      return;
    }

    setIsLoading(true);
    try {
      await organizationsService.provisionOwner(
        organizationId,
        {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          role: ORG_ROLES.OWNER,
          isActive: true,
        },
        sendInvite
      );

      toast.success("Propietario registrado exitosamente.");
      setFirstName("");
      setLastName("");
      setEmail("");
      setSendInvite(true);
      setIsOpen(false);
      onSuccess?.();
    } catch (error: any) {
      console.error("Error provisioning owner:", error);
      const msg = error?.data?.error ?? error?.message ?? "Error al registrar propietario";
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      open={isOpen}
      onOpenChange={setIsOpen}
      trigger={trigger}
      title="Agregar Propietario de Sede"
      description="Registra al usuario principal con rol Owner para administrar esta sede."
    >
      <form onSubmit={handleSubmit} className="space-y-5 pt-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Nombre"
            placeholder="Ej. Carlos"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
          />
          <Input
            label="Apellido"
            placeholder="Ej. Mendoza"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            required
          />
        </div>

        <Input
          type="email"
          label="Correo Electrónico"
          placeholder="propietario@ejemplo.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <CheckboxCard
          id="send-invite-provision"
          label="Enviar Invitación por Correo"
          description="Genera el enlace para que el propietario pueda crear su contraseña y acceder."
          checked={sendInvite}
          onCheckedChange={(checked) => setSendInvite(Boolean(checked))}
        />

        <div className="flex justify-end gap-3 pt-4 border-t border-border">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setIsOpen(false)}
            disabled={isLoading}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            loading={isLoading}
            disabled={isLoading}
            leftIcon={<UserPlus className="w-4 h-4" />}
          >
            Registrar Propietario
          </Button>
        </div>
      </form>
    </Modal>
  );
}

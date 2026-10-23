"use client";

import * as React from "react";
import { Modal, toast, Button } from "@workspace/ui/components";
import { SubscriptionForm } from "./subscription-form";
import { subscriptionsService } from "@/lib/services/subscriptions-service";
import { MemberForm } from "../members/member-form";
import { membersService } from "@/lib/services/members-service";
import { apiCode, mutationError } from "@workspace/shared";
import { IMember } from "@/types/dashboard";

interface SubscriptionModalProps {
  readonly trigger: React.ReactNode;
  readonly onSuccess?: () => void;
  readonly initialMember?: IMember | null;
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
}

export function SubscriptionModal({ trigger, onSuccess, initialMember, open, onOpenChange }: Readonly<SubscriptionModalProps>) {
  const [isControlled, setIsControlled] = React.useState(open);
  const isOpen = open ?? isControlled;
  const setIsOpen = (value: boolean) => {
    if (onOpenChange) {
      onOpenChange(value);
    } else {
      setIsControlled(value);
    }
  };
  
  const [isLoading, setIsLoading] = React.useState(false);

  // Sync with external open state
  React.useEffect(() => {
    if (open !== undefined) {
      setIsControlled(open);
    }
  }, [open]);

  // Workflow states
  const [view, setView] = React.useState<'payment' | 'member'>('payment');
  const [newMember, setNewMember] = React.useState<IMember | null>(initialMember ?? null);

  // Sync with prop when modal opens/changes
  React.useEffect(() => {
    if (initialMember) {
      setNewMember(initialMember);
    }
  }, [initialMember, isOpen]);

  // Reset workflow when modal opens/closes
  React.useEffect(() => {
    if (!isOpen) {
      setTimeout(() => {
        setView('payment');
        setNewMember(initialMember ?? null);
      }, 300); // Wait for animation to finish
    }
  }, [isOpen, initialMember]);

  const handleSubmit = async (formData: any) => {
    setIsLoading(true);
    try {
      await subscriptionsService.create(formData);
      toast.success("Suscripción registrada exitosamente.");
      onSuccess?.();
      setIsOpen(false);
    } catch (error: any) {
      const code = apiCode(error);
      if (code === "END_DATE_OVERRIDE_REASON_REQUIRED") {
        toast.error("El periodo vigente se acorta: indica el motivo del ajuste");
        // Re-throw so the form can activate the reason field and refresh the
        // member's latest subscription (the form owns that state).
        throw error;
      } else if (code === "END_DATE_BEFORE_START") {
        toast.error("La fecha final no puede ser anterior a la de inicio");
      } else if (code === "PAYMENT_CURRENCY_NOT_ACTIVE") {
        // RD-158: the server prices the payment and rejects a currency that is
        // no longer active — the operator's list is stale, not the amount.
        toast.error("La moneda de pago ya no está activa en la organización. Recarga la página.");
      } else if (code === "ACTIVE_CURRENCIES_NOT_CONFIGURED") {
        toast.error("La organización no tiene monedas activas configuradas. Configúralas antes de cobrar.");
      } else if (code === "EXCHANGE_RATE_UNAVAILABLE") {
        // RD-158: the pricing call failed at the provider — the 503 is a
        // temporary outage, not a rejected payment (same mapping as the
        // self-service renewal modal).
        toast.error("El servicio de tasas de cambio no está disponible. Intenta de nuevo en unos minutos.");
      } else if (code === "PAYMENT_CURRENCY_UNSUPPORTED") {
        toast.error("La moneda de pago seleccionada no está soportada por el proveedor de tasas.");
      } else {
        toast.error(mutationError("SubscriptionModal", error, "Fallo al registrar la suscripción"));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleMemberCreate = async (memberData: Partial<IMember>, sendInvite: boolean) => {
    setIsLoading(true);
    try {
      const created = await membersService.createMember(memberData, sendInvite);
      toast.success(`Cliente ${created.firstName} creado correctamente.`);
      setNewMember(created);
      setView('payment'); // Go back to payment with the new member selected
    } catch (error: any) {
      console.error("Error creating member:", error);
      toast.error("Error al crear el cliente");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      open={isOpen}
      onOpenChange={setIsOpen}
      size="lg"
      trigger={trigger}
      title={view === 'payment' ? "Registrar Nuevo Pago" : "Nuevo Cliente"}
      description={view === 'payment'
        ? "Vincula un miembro a un nivel de membresía activo para gestionar su ingreso y ciclo de facturación."
        : "Completa los datos básicos para registrar al cliente en el sistema antes de procesar su pago."
      }
      isScrollable={true}
    >
      <div className="pt-3">
        {/* Subscription Form (Always mounted to preserve state, but hidden when creating member) */}
        <div className={view === 'payment' ? "animate-in fade-in duration-300" : "hidden"}>
          <SubscriptionForm
            onSubmit={handleSubmit}
            isLoading={isLoading}
            initialMember={newMember}
            onAddMemberClick={() => setView('member')}
          />
        </div>

        {/* Member Form (Conditionally rendered for a fresh start each time) */}
        {view === 'member' && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="mb-4">
              <Button
                variant="link"
                onClick={() => setView('payment')}
                className="text-[10px] flex items-center gap-1"
              >
                ← VOLVER AL PAGO
              </Button>
            </div>
            <MemberForm
              onSubmit={handleMemberCreate}
              isLoading={isLoading}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}

"use client";

import * as React from "react";
import { Modal, toast } from "@workspace/ui/components";
import { SubscriptionForm } from "./subscription-form";
import { subscriptionsService } from "@/lib/services/subscriptions-service";

interface SubscriptionModalProps {
  readonly trigger: React.ReactNode;
  readonly onSuccess?: () => void;
}

export function SubscriptionModal({ trigger, onSuccess }: SubscriptionModalProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);

  // In this MVP, we only support creating new subscriptions from the modal,
  // modifications like cancel/revoke can be done from the table directly via API buttons.

  const handleSubmit = async (formData: any) => {
    setIsLoading(true);
    
    try {
      await subscriptionsService.create(formData);
      toast.success("Suscripción registrada exitosamente.");
      
      onSuccess?.();
      setIsOpen(false);
    } catch (error: any) {
      toast.error(error.message || "Fallo al registrar la suscripción");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      open={isOpen}
      onOpenChange={setIsOpen}
      trigger={trigger}
      title="Registrar Nuevo Pago (Suscripción)"
      description="Vincula un miembro a un nivel de membresía activo para gestionar su ingreso y ciclo de facturación mensual."
      isScrollable={true}
    >
      <div className="pt-3">
        <SubscriptionForm 
          onSubmit={handleSubmit} 
          isLoading={isLoading} 
        />
      </div>
    </Modal>
  );
}

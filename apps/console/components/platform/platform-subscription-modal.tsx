"use client";

import * as React from "react";
import { Modal, toast } from "@workspace/ui/components";
import { type IPlatformOrganization } from "@workspace/shared/types";
import { PlatformSubscriptionForm } from "./platform-subscription-form";
import { organizationsService } from "@/lib/services/organizations-service";

interface PlatformSubscriptionModalProps {
  readonly trigger?: React.ReactNode;
  readonly onSuccess?: () => void;
  readonly initialOrganization?: IPlatformOrganization | null;
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
}

export function PlatformSubscriptionModal({
  trigger,
  onSuccess,
  initialOrganization,
  open,
  onOpenChange,
}: PlatformSubscriptionModalProps) {
  const [isControlled, setIsControlled] = React.useState(open);
  const isOpen = open ?? isControlled;
  const setIsOpen = (value: boolean) => {
    if (onOpenChange) onOpenChange(value);
    else setIsControlled(value);
  };

  React.useEffect(() => {
    if (open !== undefined) setIsControlled(open);
  }, [open]);

  const hasPreSelected = initialOrganization !== undefined && initialOrganization !== null;

  const handleSubmit = async (formData: {
    organizationId: string;
    planId: number;
    startDate: string;
    endDate: string;
    isTrial: boolean;
    priceOverride?: string;
    payment: {
      amountPaid: number;
      currencyPaid: string;
      exchangeRateApplied?: string;
      paymentMethod: string;
      paymentMethodDetails?: any;
      status?: string;
      paymentDate?: string;
    };
  }) => {
    try {
      await organizationsService.addSubscription(formData.organizationId, {
        planId: formData.planId,
        startDate: formData.startDate,
        endDate: formData.endDate,
        isTrial: formData.isTrial,
        priceOverride: formData.priceOverride,
        payment: formData.payment,
      });
      toast.success("Suscripción registrada exitosamente.");
      onSuccess?.();
      setIsOpen(false);
    } catch (error: any) {
      toast.error(error.message || "Error al registrar la suscripción");
    }
  };

  return (
    <Modal
      open={isOpen}
      onOpenChange={setIsOpen}
      size="md"
      trigger={trigger}
      title={hasPreSelected ? `Gestionar Plan: ${initialOrganization?.name}` : "Nueva Suscripción SaaS"}
      description={
        hasPreSelected
          ? "Asigna o renueva un plan de suscripción para esta organización."
          : "Busca una organización y asígnale un plan de suscripción al ecosistema Fit-Stack."
      }
      isScrollable
    >
      <div className="p-6">
        <PlatformSubscriptionForm
          onSubmit={handleSubmit}
          initialOrganization={initialOrganization}
        />
      </div>
    </Modal>
  );
}

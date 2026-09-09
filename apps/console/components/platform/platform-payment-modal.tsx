"use client";

import * as React from "react";
import { Modal, toast } from "@workspace/ui/components";
import {
  type IPlatformOrganization,
  type IPlatformPlan,
} from "@workspace/shared/types";
import { PlatformSubscriptionForm } from "./platform-subscription-form";
import {
  platformSubscriptionsService,
  type PlatformPaymentPayload,
  type SubscriptionWithDetails,
} from "@/lib/services/platform-subscriptions-service";
import { platformPlansService } from "@/lib/services/platform-plans-service";
import { organizationsService } from "@/lib/services/organizations-service";
import { mutationError } from "@/lib/errors";

interface PlatformPaymentModalProps {
  readonly subscription: SubscriptionWithDetails;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSuccess?: () => void;
  readonly settings?: Record<string, string>;
  readonly className?: string;
}

export function PlatformPaymentModal({
  subscription,
  open,
  onOpenChange,
  onSuccess,
  settings,
  className = "subs-payment-modal",
}: PlatformPaymentModalProps) {
  const [isLoading, setIsLoading] = React.useState(false);
  const [plan, setPlan] = React.useState<IPlatformPlan | null>(null);
  const [organization, setOrganization] =
    React.useState<IPlatformOrganization | null>(null);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const load = async () => {
      try {
        const [loadedPlan, loadedOrg] = await Promise.all([
          subscription.planId
            ? platformPlansService
                .getById(subscription.planId)
                .catch(() => null)
            : Promise.resolve(null),
          organizationsService
            .getById(subscription.organizationId)
            .catch(() => null),
        ]);
        if (!cancelled) {
          setPlan(loadedPlan);
          setOrganization(loadedOrg);
        }
      } catch (err) {
        toast.error(
          mutationError(
            "PlatformPaymentModal",
            err,
            "No se pudo cargar la suscripción",
          ),
        );
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [open, subscription.planId, subscription.organizationId]);

  const handleSubmit = async (formData: {
    payment: PlatformPaymentPayload;
  }) => {
    setIsLoading(true);
    try {
      await platformSubscriptionsService.addPayment(
        subscription.id,
        formData.payment,
      );
      toast.success("Pago registrado exitosamente.");
      onSuccess?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(
        mutationError(
          "PlatformPaymentModal",
          err,
          "No se pudo registrar el pago",
        ),
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      trigger={null}
      className={className}
      title={`Registrar Pago: ${subscription.organizationName || subscription.organizationId}`}
      description="Registra un pago sobre la suscripción actual de esta organización."
      isScrollable
    >
      <PlatformSubscriptionForm
        onSubmit={handleSubmit}
        isLoading={isLoading}
        initialOrganization={organization}
        initialPlan={plan}
        paymentOnly
        submitLabel="REGISTRAR PAGO"
        settings={settings}
      />
    </Modal>
  );
}

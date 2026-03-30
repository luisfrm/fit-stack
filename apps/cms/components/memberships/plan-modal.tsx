"use client";

import * as React from "react";
import { Modal, toast } from "@workspace/ui/components";
import { PlanForm } from "./plan-form";
import { type IMembershipPlan } from "@/types/dashboard";
import { plansService } from "@/lib/services/plans-service";

interface PlanModalProps {
  readonly planData?: IMembershipPlan;
  readonly trigger: React.ReactNode;
  readonly onSuccess?: () => void;
}

export function PlanModal({ planData, trigger, onSuccess }: PlanModalProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);

  const isEdit = !!planData?.id;

  const handleSubmit = async (formData: Omit<IMembershipPlan, "id">) => {
    setIsLoading(true);
    
    try {
      if (isEdit && planData?.id) {
        await plansService.update(planData.id, formData);
        toast.success("Plan actualizado correctamente.");
      } else {
        await plansService.create(formData);
        toast.success("Plan creado exitosamente.");
      }
      
      onSuccess?.();
      setIsOpen(false);
    } catch (error: any) {
      toast.error(error.message || "Algo salió mal guardando el plan");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      open={isOpen}
      onOpenChange={setIsOpen}
      trigger={trigger}
      title={isEdit ? "Editar Plan" : "Nuevo Plan"}
      description="Configura los detalles de facturación y visibilidad de este plan."
      isScrollable={true}
    >
      <PlanForm 
        initialData={planData} 
        onSubmit={handleSubmit} 
        isLoading={isLoading} 
      />
    </Modal>
  );
}

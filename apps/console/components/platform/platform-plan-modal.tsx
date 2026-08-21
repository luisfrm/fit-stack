"use client";

import * as React from "react";
import { Modal, toast } from "@workspace/ui/components";
import { PlatformPlanForm } from "./platform-plan-form";
import { type IPlatformPlan } from "@workspace/shared/types";
import { platformPlansService } from "@/lib/services/platform-plans-service";
import type { FeatureCatalog } from "@workspace/shared";

interface PlatformPlanModalProps {
  readonly planData?: IPlatformPlan;
  readonly trigger: React.ReactNode;
  readonly onSuccess?: () => void;
  readonly settings?: Record<string, string>;
  readonly catalog?: FeatureCatalog;
}

export function PlatformPlanModal({ planData, trigger, onSuccess, settings, catalog }: PlatformPlanModalProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);

  const isEdit = !!planData?.id;

  const handleSubmit = async (formData: any) => {
    setIsLoading(true);
    try {
      if (isEdit && planData?.id) {
        await platformPlansService.update(planData.id, formData);
        toast.success("Plan de plataforma actualizado.");
      } else {
        await platformPlansService.create(formData);
        toast.success("Plan de plataforma creado.");
      }
      onSuccess?.();
      setIsOpen(false);
    } catch (error: any) {
      toast.error(error?.data?.error || error.message || "Error al guardar el plan");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      open={isOpen}
      onOpenChange={setIsOpen}
      trigger={trigger}
      title={isEdit ? "Editar Plan SaaS" : "Nuevo Plan SaaS"}
      description="Define los límites técnicos y accesos globales para este nivel de suscripción."
      isScrollable={true}
    >
      <PlatformPlanForm
        initialData={planData}
        onSubmit={handleSubmit}
        isLoading={isLoading}
        settings={settings}
        catalog={catalog}
      />
    </Modal>
  );
}
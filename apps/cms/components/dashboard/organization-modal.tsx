"use client";

import * as React from "react";
import { Modal, toast } from "@workspace/ui/components";
import { OrganizationForm } from "./organization-form";
import { type Organization } from "./organization-mobile-card";
import { organizationsService } from "@/lib/services/organizations-service";

interface OrganizationModalProps {
  readonly organization?: Organization;
  readonly trigger: React.ReactNode;
  readonly onSuccess?: () => void;
}

export function OrganizationModal({ organization, trigger, onSuccess }: OrganizationModalProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);

  const isEdit = !!organization?.id;

  const handleSubmit = async (formData: Partial<Organization>) => {
    setIsLoading(true);
    
    try {
      if (isEdit && organization?.id) {
        await organizationsService.updateOrganization(organization.id, formData);
        toast.success("Organización actualizada correctamente.");
      } else {
        await organizationsService.createOrganization(formData);
        toast.success("Organización creada exitosamente.");
      }
      
      onSuccess?.();
      setIsOpen(false);
    } catch (error: any) {
      const message = error.response?.data?.error ?? error.message ?? "Algo salió mal";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      open={isOpen}
      onOpenChange={setIsOpen}
      trigger={trigger}
      title={isEdit ? "Editar Organización" : "Nueva Organización"}
      description={
        isEdit 
          ? `Actualiza la información y configuración de ${organization.name}.` 
          : "Completa los datos para dar de alta a una nueva entidad en la plataforma SaaS."
      }
      isScrollable={true}
    >
      <OrganizationForm 
        initialData={organization} 
        onSubmit={handleSubmit} 
        isLoading={isLoading} 
      />
    </Modal>
  );
}

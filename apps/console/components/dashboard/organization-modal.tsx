"use client";

import * as React from "react";
import { Modal, toast } from "@workspace/ui/components";
import { OrganizationForm, type OwnerData } from "./organization-form";
import { organizationsService } from "@/lib/services/organizations-service";
import { uploadService } from "@/lib/services/upload-service";
import { type IPlatformOrganization, ORG_ROLES } from "@workspace/shared";

interface OrganizationModalProps {
  readonly initialData?: IPlatformOrganization;
  readonly trigger?: React.ReactNode;
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly onSuccess?: () => void;
}

export function OrganizationModal({
  initialData,
  trigger,
  open: controlledOpen,
  onOpenChange: setControlledOpen,
  onSuccess,
}: OrganizationModalProps) {
  const [internalOpen, setInternalOpen] = React.useState(false);

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;

  const handleOpenChange = (value: boolean) => {
    if (isControlled) {
      setControlledOpen?.(value);
    } else {
      setInternalOpen(value);
    }
  };

  const handleSuccess = () => {
    handleOpenChange(false);
    onSuccess?.();
  };

  const isEdit = !!initialData?.id;

  const handleSubmit = async (formData: Partial<IPlatformOrganization>, ownerData?: OwnerData, logoFile?: File | null) => {
    try {
      if (isEdit && initialData?.id) {
        await organizationsService.update(initialData.id, formData as any);
        toast.success("Organización actualizada correctamente.");
      } else {
        // 1. Crear la Organización (Base)
        const newOrg = await organizationsService.create(formData as any);
        
        if (!newOrg?.id) throw new Error("No se pudo obtener el ID de la nueva organización.");

        const finalOrgId = newOrg.id;

        // 2. Si hay logo, subirlo y actualizar la organización
        if (logoFile) {
          try {
            const logoUrl = await uploadService.uploadFile(logoFile, undefined, finalOrgId);
            await organizationsService.update(finalOrgId, { logo: logoUrl } as any);
          } catch (uploadError) {
            console.error("Error al subir logo en creación:", uploadError);
            toast.warning("Sede creada, pero hubo un problema al subir el logo.");
          }
        }

        // 3. Si hay datos de propietario, crearlo
        if (ownerData) {
          try {
            await organizationsService.provisionOwner(finalOrgId, {
              firstName: ownerData.firstName,
              lastName: ownerData.lastName,
              email: ownerData.email,
              role: ORG_ROLES.OWNER,
              isActive: true,
            }, ownerData.sendInvite);
            toast.success("Sede y Propietario configurados exitosamente.");
          } catch (staffError: any) {
            console.error("Error al crear propietario:", staffError);
            toast.warning("Sede creada, pero hubo un problema al registrar al propietario.");
          }
        } else {
          toast.success("Organización creada exitosamente.");
        }
      }
      handleSuccess();
    } catch (error: any) {
      const message = error.response?.data?.error ?? error.message ?? "Algo salió mal";
      toast.error(message);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={handleOpenChange}
      trigger={trigger!}
      title={isEdit ? "Editar Organización" : "Nueva Organización"}
      description={
        isEdit
          ? `Actualiza la información y configuración de ${initialData?.name}.`
          : "Completa los datos para dar de alta a una nueva entidad en la plataforma SaaS."
      }
      isScrollable={true}
      size="lg"
    >
      <OrganizationForm
        initialData={initialData}
        onSubmit={handleSubmit}
      />
    </Modal>
  );
}
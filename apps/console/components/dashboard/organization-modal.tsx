"use client";

import * as React from "react";
import { Modal, toast } from "@workspace/ui/components";
import { OrganizationForm } from "./organization-form";
import type { OwnerData } from "./organization-form-types";
import { organizationsService } from "@/lib/services/organizations-service";
import { uploadService } from "@/lib/services/upload-service";
import { apiCode, mutationError } from "@/lib/errors";
import { type IPlatformOrganization, DEFAULT_ORG_STAFF_VALUES } from "@workspace/shared";

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

  const handleLogoUpload = async (orgId: string, logoFile: File) => {
    try {
      const logoUrl = await uploadService.uploadFile(logoFile, orgId);
      await organizationsService.update(orgId, { logo: logoUrl } as any);
    } catch (uploadError) {
      console.error("Error al subir logo en creación:", uploadError);
      toast.warning("Sede creada, pero hubo un problema al subir el logo.");
    }
  };

  const handleOwnerProvisioning = async (orgId: string, ownerData?: OwnerData) => {
    if (!ownerData) {
      toast.success("Organización creada exitosamente.");
      return;
    }

    try {
      await organizationsService.provisionOwner(
        orgId,
        {
          ...DEFAULT_ORG_STAFF_VALUES,
          firstName: ownerData.firstName,
          lastName: ownerData.lastName,
          email: ownerData.email,
        },
        ownerData.sendInvite
      );
      toast.success("Sede y Propietario configurados exitosamente.");
    } catch (staffError: any) {
      console.error("Error al crear propietario:", staffError);
      toast.warning("Sede creada, pero hubo un problema al registrar al propietario.");
    }
  };

  const handleCreateOrganization = async (
    formData: Partial<IPlatformOrganization>,
    ownerData?: OwnerData,
    logoFile?: File | null,
    settings?: Record<string, string>
  ) => {
    const newOrg = await organizationsService.create({
      ...(formData as any),
      ...(settings ? { settings } : {}),
    });

    if (!newOrg?.id) {
      throw new Error("No se pudo obtener el ID de la nueva organización.");
    }

    if (logoFile) {
      await handleLogoUpload(newOrg.id, logoFile);
    }

    await handleOwnerProvisioning(newOrg.id, ownerData);
  };

  const handleSubmit = async (
    formData: Partial<IPlatformOrganization>,
    ownerData?: OwnerData,
    logoFile?: File | null,
    settings?: Record<string, string>
  ) => {
    try {
      if (isEdit && initialData?.id) {
        await organizationsService.update(initialData.id, formData as any);
        toast.success("Organización actualizada correctamente.");
      } else {
        await handleCreateOrganization(formData, ownerData, logoFile, settings);
      }
      handleSuccess();
    } catch (error: unknown) {
      // Toasts resolve by business CODE, never by the server message. The
      // formal-taxpayer activation is rejected while the fiscal identity
      // (legalName + taxId + address) is incomplete.
      if (apiCode(error) === "FISCAL_IDENTITY_INCOMPLETE") {
        toast.error(
          mutationError(
            "OrganizationModal",
            error,
            "Completa el nombre legal, el ID fiscal y la dirección antes de activar el contribuyente formal.",
          ),
        );
        return;
      }
      toast.error(mutationError("OrganizationModal", error, "Algo salió mal"));
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
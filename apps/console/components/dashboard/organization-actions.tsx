"use client";

import * as React from "react";
import { Edit2, CreditCard, Zap, ExternalLink } from "lucide-react";
import { ActionsDropdown } from "@workspace/ui/components";
import { type IPlatformOrganization } from "@workspace/shared/types";
import { GrantAiCreditsModal } from "./grant-ai-credits-modal";

interface OrganizationActionsProps {
  readonly organization: IPlatformOrganization;
  readonly onEdit?: () => void;
  readonly onAddSubscription?: () => void;
  readonly onViewSubscriptions?: () => void;
  readonly onSuccess?: () => void;
  readonly EditModal?: React.ComponentType<{
    initialData: IPlatformOrganization;
    onSuccess: () => void;
    trigger: React.ReactNode;
  }>;
  readonly menuClassName?: string;
}

export function OrganizationActions({
  organization,
  onEdit,
  onAddSubscription,
  onViewSubscriptions,
  onSuccess,
  EditModal,
  menuClassName,
}: OrganizationActionsProps) {
  const dropdownSections = React.useMemo(
    () => [
      {
        label: "Gestión de Sede",
        items: [
          {
            label: "Editar Información",
            icon: <Edit2 size={14} />,
            Modal: EditModal,
            show: !!EditModal,
          },
          {
            label: "Editar Información",
            icon: <Edit2 size={14} />,
            onClick: onEdit,
            show: !EditModal,
          },
          {
            label: "Ver Suscripciones",
            icon: <ExternalLink size={14} />,
            onClick: onViewSubscriptions,
            show: !!onViewSubscriptions,
          },
          {
            label: "Gestionar Plan",
            icon: <CreditCard size={14} />,
            onClick: onAddSubscription,
          },
          {
            label: "Dar AI Credits",
            icon: <Zap size={14} />,
            Modal: GrantAiCreditsModal,
            show: true,
          },
        ],
      },
    ],
    [EditModal, onEdit, onAddSubscription, onViewSubscriptions],
  );

  return (
    <div className="flex items-center justify-end gap-1">
      <ActionsDropdown
        modalData={organization}
        onSuccess={onSuccess}
        className={menuClassName}
        sections={dropdownSections}
      />
    </div>
  );
}

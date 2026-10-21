"use client";

import * as React from "react";
import { Edit2, CreditCard, Zap, ExternalLink } from "lucide-react";
import { ActionsDropdown } from "@workspace/ui/components";
import { canPlatform, type IPlatformOrganization } from "@workspace/shared";
import { usePlatformAuth } from "@workspace/auth/platform";
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
  const { platformRole } = usePlatformAuth();
  const canManage = canPlatform(platformRole, "console", "manage");
  const dropdownSections = React.useMemo(
    () => [
      {
        label: "Gestión de Sede",
        items: [
          {
            label: "Editar Información",
            icon: <Edit2 size={14} />,
            Modal: EditModal,
            show: !!EditModal && canManage,
          },
          {
            label: "Editar Información",
            icon: <Edit2 size={14} />,
            onClick: onEdit,
            show: !EditModal && canManage,
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
            show: canManage,
          },
          {
            label: "Dar AI Credits",
            icon: <Zap size={14} />,
            Modal: GrantAiCreditsModal,
            show: canManage,
          },
        ],
      },
    ],
    [EditModal, onEdit, onAddSubscription, onViewSubscriptions, canManage],
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

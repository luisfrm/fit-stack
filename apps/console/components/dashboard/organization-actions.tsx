"use client";

import * as React from "react";
import {
  Settings,
  Edit2,
  Power,
  CreditCard,
  Zap
} from "lucide-react";
import {
  Button,
  ActionsDropdown
} from "@workspace/ui/components";
import { type IPlatformOrganization } from "@workspace/shared/types";
import { GrantAiCreditsModal } from "./grant-ai-credits-modal";

interface OrganizationActionsProps {
  readonly organization: IPlatformOrganization;
  readonly status: 'active' | 'inactive' | 'pending';
  readonly onEdit?: () => void;
  readonly onSettings?: () => void;
  readonly onAddSubscription?: () => void;
  readonly onToggleStatus?: () => void;
  readonly onSuccess?: () => void;
  readonly EditModal?: React.ComponentType<{
    initialData: IPlatformOrganization;
    onSuccess: () => void;
    trigger: React.ReactNode;
  }>;
}

export function OrganizationActions({
  organization,
  status,
  onEdit,
  onSettings,
  onAddSubscription,
  onToggleStatus,
  onSuccess,
  EditModal
}: OrganizationActionsProps) {
  const dropdownSections = React.useMemo(() => [
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
    {
      label: "Estado",
      items: [
        {
          label: status === 'active' ? 'Desactivar Acceso' : 'Activar Acceso',
          icon: <Power size={14} />,
          variant: 'amber' as const,
          onClick: onToggleStatus,
        },
      ],
    },
  ], [EditModal, onEdit, onAddSubscription, status, onToggleStatus]);

  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        variant="ghost"
        size="icon"
        title="Configuración Técnica"
        onClick={onSettings}
      >
        <Settings size={18} />
      </Button>

      <ActionsDropdown
        modalData={organization}
        onSuccess={onSuccess}
        sections={dropdownSections}
      />
    </div>
  );
}
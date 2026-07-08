"use client";

import { type LucideIcon, BarChart3, Settings } from "lucide-react";

export interface FabItem {
  id: string;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}

export const GLOBAL_FAB_ITEMS: FabItem[] = [
  {
    id: "analytics",
    icon: BarChart3,
    label: "Estadísticas",
    onClick: () => {
      window.location.href = "/dashboard";
    },
  },
  {
    id: "settings",
    icon: Settings,
    label: "Configuración",
    onClick: () => {
      window.location.href = "/dashboard/settings";
    },
  },
];
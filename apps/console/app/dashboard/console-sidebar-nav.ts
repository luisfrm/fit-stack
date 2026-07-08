import * as Icons from "lucide-react";
import { SidebarNavItem } from "@workspace/ui/components";

export const ConsoleSidebarNav: SidebarNavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: Icons.LayoutGrid,
  },
  {
    label: "Organizaciones",
    href: "/dashboard/organizations",
    icon: Icons.Building2,
  },
  {
    label: "Suscripciones",
    href: "/dashboard/subscriptions",
    icon: Icons.CreditCard,
  },
  {
    label: "Planes",
    href: "/dashboard/plans",
    icon: Icons.Package,
  },
  {
    label: "Configuración",
    href: "/dashboard/settings",
    icon: Icons.Settings,
  },
];
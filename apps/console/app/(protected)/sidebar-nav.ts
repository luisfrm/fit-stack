import * as Icons from "lucide-react";
import { SidebarNavItem } from "@workspace/ui/components";

export const SidebarNav: SidebarNavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: Icons.LayoutGrid,
  },
  {
    label: "Staff",
    href: "/staff",
    icon: Icons.Users,
  },
  {
    label: "Organizaciones",
    href: "/organizations",
    icon: Icons.Building2,
  },
  {
    label: "Suscripciones",
    href: "/subscriptions",
    icon: Icons.CreditCard,
  },
  {
    label: "Planes",
    href: "/plans",
    icon: Icons.Package,
  },
  {
    label: "Configuración",
    href: "/settings",
    icon: Icons.Settings,
  },
];
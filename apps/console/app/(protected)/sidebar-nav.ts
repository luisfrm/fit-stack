import * as Icons from "lucide-react";
import type { SidebarNavItem } from "@workspace/ui/next";
import type { PlatformStatement } from "@workspace/shared";

export type PlatformNavItem = SidebarNavItem & {
  module: keyof PlatformStatement;
  action: string;
};

export const SidebarNav: PlatformNavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: Icons.LayoutGrid,
    module: "organization",
    action: "list",
  },
  {
    label: "Staff",
    href: "/staff",
    icon: Icons.Users,
    module: "user",
    action: "list",
  },
  {
    label: "Organizaciones",
    href: "/organizations",
    icon: Icons.Building2,
    module: "organization",
    action: "list",
  },
  {
    label: "Suscripciones",
    href: "/subscriptions",
    icon: Icons.CreditCard,
    module: "subscription",
    action: "list",
  },
  {
    label: "Comprobantes",
    href: "/subscriptions/receipts",
    icon: Icons.ReceiptText,
    module: "subscription",
    action: "list",
  },
  {
    label: "Planes",
    href: "/plans",
    icon: Icons.Package,
    module: "plan",
    action: "list",
  },
  {
    label: "Configuración",
    href: "/settings",
    icon: Icons.Settings,
    module: "setting",
    action: "read",
  },
];

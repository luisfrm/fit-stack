import * as Icons from "lucide-react";
import { SidebarNavItem } from "@workspace/ui/components";

export const ConsoleSidebarNav: SidebarNavItem[] = [
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
  {
    label: "Monedas",
    href: "/dashboard/settings/currencies",
    icon: Icons.Coins,
  },
  {
    label: "Métodos de Pago",
    href: "/dashboard/settings/payment-methods",
    icon: Icons.Wallet,
  },
];
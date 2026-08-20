"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  Dumbbell,
  CreditCard,
  Settings,
  ShieldCheck,
  ArrowLeftRight,
  MessageSquare,
  Wallet,
} from "lucide-react";

import {
  IOrganization,
  formatOrgRole,
  PERMISSION_ACTIONS,
  PERMISSION_MODULES,
  type PermissionModule,
} from "@workspace/shared";
import {
  AppSidebar as UISidebar,
  MobileNav as UIMobileNav,
  type SidebarUser,
  type SidebarNavItem,
  Button,
  Modal,
} from "@workspace/ui/components";
import { uploadService } from "@/lib/services/upload-service";
import { useAuth } from "@/lib/hooks/use-auth";
import { usePermissions } from "@workspace/auth/hooks";
import { useTheme } from "@/lib/hooks/use-theme";
import SignOutButton from "../SignOutButton";
import { authClient } from "@/lib/auth-client";
import { OrganizationPicker } from "./organization-picker";

/* ─────────────────────────────────────────────
   SIDEBAR NAV SCHEMAS
   ───────────────────────────────────────────── */

type GymNavItem = SidebarNavItem & { module: PermissionModule };

const GYM_NAV_ITEMS: GymNavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, module: PERMISSION_MODULES.DASHBOARD },
  { label: "Staff", href: "/dashboard/staff", icon: ShieldCheck, module: PERMISSION_MODULES.STAFF },
  { label: "Pagos", href: "/dashboard/payments", icon: CreditCard, module: PERMISSION_MODULES.SUBSCRIPTIONS },
  { label: "Clientes", href: "/dashboard/members", icon: Users, module: PERMISSION_MODULES.MEMBERS },
  { label: "Contenido", href: "/dashboard/content", icon: LayoutDashboard, module: PERMISSION_MODULES.CONTENT },
  { label: "Membresías", href: "/dashboard/memberships", icon: Wallet, module: PERMISSION_MODULES.PLANS },
  { label: "Clases", href: "/dashboard/classes", icon: CalendarDays, module: PERMISSION_MODULES.CLASSES },
  { label: "Entrenadores", href: "/dashboard/trainers", icon: Dumbbell, module: PERMISSION_MODULES.STAFF },
  { label: "Chat IA", href: "/dashboard/chat", icon: MessageSquare, module: PERMISSION_MODULES.AI },
  { label: "Configuración", href: "/dashboard/settings", icon: Settings, module: PERMISSION_MODULES.SETTINGS },
];

function useFilteredNavItems(): SidebarNavItem[] {
  const { can } = usePermissions();
  return GYM_NAV_ITEMS.filter((item) =>
    can(item.module, PERMISSION_ACTIONS.READ),
  );
}

export function SwitchOrganizationAction() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const { data: orgs } = authClient.useListOrganizations();

  const handleSelect = React.useCallback(() => {
    setOpen(false);
    router.refresh();
  }, [router]);

  if (!orgs || orgs.length <= 1) {
    return null;
  }

  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      title="Cambiar de sede"
      description="Selecciona la sede con la que deseas trabajar ahora."
      trigger={
        <Button
          variant="link"
          size="xs"
          className="p-0 uppercase gap-1.5 text-primary hover:text-primary/80"
          leftIcon={<ArrowLeftRight className="w-3 h-3" />}
        >
          Cambiar sede
        </Button>
      }
    >
      <div className="py-4">
        {open && (
          <OrganizationPicker
            isModal
            onSelect={handleSelect}
          />
        )}
      </div>
    </Modal>
  );
}

function useSidebarBranding(user: SidebarUser, initialOrg?: IOrganization | null) {
  const { isPending: sessionLoading, activeOrganization: clientOrg } = useAuth();
  const { isDark, toggleTheme } = useTheme();

  const activeOrganization = initialOrg ?? clientOrg;
  // Sidebar branding depends solely on organization identity (session), independent of regional settings query state
  // to prevent SSR/hydration mismatch error.
  const isBrandingLoading = sessionLoading && !activeOrganization;
  const navigation = useFilteredNavItems();

  const formattedUser = React.useMemo(() => ({
    ...user,
    role: formatOrgRole(user.role),
  }), [user]);

  const brandingAction = React.useMemo(() => {
    return <SwitchOrganizationAction />;
  }, []);

  return {
    activeOrganization,
    isBrandingLoading,
    navigation,
    formattedUser,
    brandingAction,
    isDark,
    toggleTheme,
  };
}

export function AppSidebar({ user, activeOrganization: initialOrg }: Readonly<{ user: SidebarUser, activeOrganization?: IOrganization | null }>) {
  const {
    activeOrganization,
    isBrandingLoading,
    navigation,
    formattedUser,
    brandingAction,
    isDark,
    toggleTheme,
  } = useSidebarBranding(user, initialOrg);

  return (
    <UISidebar
      user={formattedUser}
      navigation={navigation}
      branding={{
        logo: activeOrganization?.logo ? uploadService.getMediaUrl(activeOrganization.logo) : undefined,
        title: activeOrganization?.name || "Gym unnamed",
        isLoading: isBrandingLoading,
        fallbackIcon: Dumbbell,
        action: brandingAction,
      }}
      footer={<SignOutButton />}
      themeToggle={{ isDark, toggle: toggleTheme }}
    />
  );
}

export function MobileNav({ user, activeOrganization: initialOrg }: Readonly<{ user: SidebarUser, activeOrganization?: IOrganization | null }>) {
  const {
    activeOrganization,
    isBrandingLoading,
    navigation,
    formattedUser,
    brandingAction,
    isDark,
    toggleTheme,
  } = useSidebarBranding(user, initialOrg);

  return (
    <UIMobileNav
      user={formattedUser}
      navigation={navigation}
      branding={{
        logo: activeOrganization?.logo ? uploadService.getMediaUrl(activeOrganization.logo) : undefined,
        title: activeOrganization?.name || "Gym unnamed",
        isLoading: isBrandingLoading,
        fallbackIcon: Dumbbell,
        action: brandingAction,
      }}
      footer={<SignOutButton />}
      themeToggle={{ isDark, toggle: toggleTheme }}
    />
  );
}
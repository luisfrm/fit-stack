# Hybrid FAB (Floating Action Button) System

**Date:** 2026-05-02
**Status:** Approved

---

## 1. Overview

The FAB component currently shows a fixed set of items regardless of the active module. This design introduces a hybrid system where:

- **Global actions** are always visible across all modules (e.g., Settings, Dashboard)
- **Module-specific actions** are shown only when the user is in that module context

---

## 2. Architecture

### 2.1 Config File Location

`apps/cms/lib/config/fab-config.ts`

### 2.2 Config Structure

```typescript
// Global items - visible on ALL modules
export const GLOBAL_FAB_ITEMS = [
  {
    id: "settings",
    icon: Settings,
    label: "Configuración",
    path: "/dashboard/settings",
  },
  {
    id: "analytics",
    icon: BarChart3,
    label: "Estadísticas",
    path: "/dashboard",
  },
] as const;

// Module-specific items - shown when currentModule matches
export const MODULE_FAB_ITEMS = {
  payments: [
    {
      id: "new-payment",
      icon: Plus,
      label: "Nuevo pago",
      action: "OPEN_NEW_PAYMENT_MODAL", // future: action types
    },
  ],
  members: [
    {
      id: "new-member",
      icon: Users,
      label: "Nuevo miembro",
      action: "OPEN_NEW_MEMBER_MODAL",
    },
  ],
  classes: [
    {
      id: "new-class",
      icon: Calendar,
      label: "Nueva clase",
      action: "OPEN_NEW_CLASS_MODAL",
    },
  ],
  trainers: [
    {
      id: "new-trainer",
      icon: Dumbbell,
      label: "Nuevo entrenador",
      action: "OPEN_NEW_TRAINER_MODAL",
    },
  ],
  memberships: [
    {
      id: "new-plan",
      icon: Wallet,
      label: "Nuevo plan",
      action: "OPEN_NEW_PLAN_MODAL",
    },
  ],
  content: [
    {
      id: "new-page",
      icon: FileText,
      label: "Nueva página",
      action: "OPEN_NEW_PAGE_MODAL",
    },
  ],
  staff: [
    {
      id: "new-user",
      icon: UserPlus,
      label: "Nuevo usuario",
      action: "OPEN_NEW_USER_MODAL",
    },
  ],
} as const;

// All supported modules
export type FabModule = keyof typeof MODULE_FAB_ITEMS;

// Merged items for a module (global + module-specific)
export function getFabItemsForModule(module: FabModule | null) {
  if (!module) return [...GLOBAL_FAB_ITEMS];
  return [...GLOBAL_FAB_ITEMS, ...MODULE_FAB_ITEMS[module]];
}
```

### 2.3 FAB Component Changes

```typescript
// In packages/ui/src/components/floating-action-button.tsx

interface FloatingActionButtonProps {
  // Existing props...
  config: FabConfig;

  // NEW: current module to determine which items to show
  currentModule?: "payments" | "members" | "classes" | "trainers" | "memberships" | "content" | "staff";
}
```

However, to keep the FAB component generic (reusable across apps), the component only receives `config: FabConfig`. The CMS app is responsible for computing the correct config based on the current route/module.

### 2.4 CMS Integration

A new hook or utility in the CMS:

```typescript
// apps/cms/lib/hooks/use-fab-config.ts

export function useFabConfig() {
  const pathname = usePathname();

  // Derive module from pathname
  const currentModule = React.useMemo(() => {
    if (pathname.includes("/payments")) return "payments";
    if (pathname.includes("/members")) return "members";
    if (pathname.includes("/classes")) return "classes";
    if (pathname.includes("/trainers")) return "trainers";
    if (pathname.includes("/memberships")) return "memberships";
    if (pathname.includes("/content")) return "content";
    if (pathname.includes("/staff")) return "staff";
    return null;
  }, [pathname]);

  const config = React.useMemo(() => ({
    items: getFabItemsForModule(currentModule),
    // triggerIcon can remain default or be customized per module
  }), [currentModule]);

  return config;
}
```

### 2.5 Usage in Pages

```tsx
// apps/cms/app/dashboard/payments/page.tsx

export default function PaymentsPage() {
  const fabConfig = useFabConfig();

  return (
    <div>
      {/* page content */}
      <FloatingActionButton config={fabConfig} />
    </div>
  );
}
```

---

## 3. Action Handling

### 3.1 Current Implementation

Currently, FAB items have `onClick?: () => void`. The CMS passes handlers when integrating.

### 3.2 Proposed: Action Types

To make the FAB more declarative and reduce prop drilling:

```typescript
type FabAction =
  | { type: "NAVIGATE"; path: string }
  | { type: "OPEN_MODAL"; modal: string }
  | { type: "CALLBACK"; fn: () => void };
```

However, for v1, we can keep it simple with just `onClick` and let the CMS handle routing via `useRouter`.

---

## 4. Future Considerations

### 4.1 RBAC Integration

Items can include a `requiredPermission` field:

```typescript
{
  id: "new-payment",
  icon: Plus,
  label: "Nuevo pago",
  requiredPermission: "payments:write", // only show if user has permission
}
```

The `getFabItemsForModule` function can filter based on user permissions.

### 4.2 Module-specific Trigger Icons

The trigger icon could change based on the module (e.g., Plus for payments, Calendar for classes).

### 4.3 Custom Global Items per Organization

Organizations might want to customize their global FAB items (e.g., add a custom action).

---

## 5. Files to Modify

| File | Change |
|------|--------|
| `apps/cms/lib/config/fab-config.ts` | NEW - FAB configuration |
| `apps/cms/lib/hooks/use-fab-config.ts` | NEW - Hook to derive FAB config from route |
| `packages/ui/src/components/floating-action-button.tsx` | Update props to be more flexible |
| `apps/cms/app/dashboard/*/page.tsx` | Integrate `useFabConfig()` hook |

---

## 6. Backward Compatibility

- FAB component continues to accept `config: FabConfig` - no breaking changes to existing usage
- `DEFAULT_FAB_ITEMS` remains in the FAB component for reference and fallback
- Existing integrations that pass `config` directly continue to work

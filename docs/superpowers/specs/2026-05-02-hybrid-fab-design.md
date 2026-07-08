# FAB (Floating Action Button) System - Simplified

**Date:** 2026-05-02
**Status:** Implemented
**Last Updated:** 2026-05-15

---

## 1. Overview

Simple FAB system where each page defines its own FAB items by spreading `GLOBAL_FAB_ITEMS` and adding module-specific items.

---

## 2. Architecture

### 2.1 File Location

`apps/cms/lib/constants/fab-items.ts`

### 2.2 Structure

```typescript
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
    onClick: () => { window.location.href = "/dashboard"; },
  },
  {
    id: "settings",
    icon: Settings,
    label: "Configuración",
    onClick: () => { window.location.href = "/dashboard/settings"; },
  },
];
```

---

## 3. Usage in Pages

```tsx
import { GLOBAL_FAB_ITEMS } from "@/lib/constants/fab-items";
import { Plus } from "lucide-react";

export default function PaymentsPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fabItems = [
    ...GLOBAL_FAB_ITEMS,
    {
      id: "new-payment",
      icon: Plus,
      label: "Nuevo pago",
      onClick: () => setIsModalOpen(true)
    }
  ];

  return (
    <div>
      {/* page content */}
      <FloatingActionButton config={{ items: fabItems }} />
    </div>
  );
}
```

---

## 4. Design Principles

- **Simple:** No hooks, no complex types, no route detection
- **Obvious:** Each page shows exactly what FAB items it has
- **Flexible:** Each page controls its own onClick handlers
- **Explicit:** Global items are clearly defined in one place

---

## 5. Adding New FAB Items

### To add a global item (appears on ALL pages):
Edit `apps/cms/lib/constants/fab-items.ts` and add to `GLOBAL_FAB_ITEMS`.

### To add a page-specific item:
In that page's component, add to the items array after spreading `GLOBAL_FAB_ITEMS`.

### To remove an item from a specific page:
Don't spread `GLOBAL_FAB_ITEMS` and define items manually.

---

## 6. Files

| File | Description |
|------|-------------|
| `apps/cms/lib/constants/fab-items.ts` | Global FAB items definition |
| `packages/ui/src/components/floating-action-button.tsx` | FAB component (no changes) |

---

## 7. Future Considerations

- RBAC filtering based on user permissions
- Module-specific trigger icons
- Persist FAB state across sessions
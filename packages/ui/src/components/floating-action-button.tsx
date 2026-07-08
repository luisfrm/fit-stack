"use client";

import * as React from "react";
import { type LucideIcon, ChevronDown, X, Plus, Users, Calendar, FileText, BarChart3, Settings } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";

export interface FabItem {
  /** Unique identifier */
  id: string;
  /** Icon to display */
  icon: LucideIcon;
  /** Label shown next to button */
  label: string;
  /** Optional click handler */
  onClick?: () => void;
}

export interface FabConfig {
  /** Items to show in the FAB menu */
  items: FabItem[];
  /** Trigger button icon (default: ChevronDown) */
  triggerIcon?: LucideIcon;
}

interface FloatingActionButtonProps {
  /** FAB configuration */
  config: FabConfig;
  /** CSS class for positioning */
  className?: string;
  /** Initial open state */
  defaultOpen?: boolean;
}

/**
 * Floating Action Button (FAB) - Quick actions menu
 * 
 * Position: Fixed bottom-right, above sidebar and content
 * - Desktop: right offset accounts for 256px sidebar + 24px padding = 280px
 * - Mobile: 16px from edges
 * 
 * Usage:
 * ```tsx
 * <FloatingActionButton
 *   config={{
 *     items: [
 *       { id: 'new', icon: Plus, label: 'Nuevo pago', onClick: () => {} },
 *     ]
 *   }}
 * />
 * ```
 */
export function FloatingActionButton({
  config,
  className,
  defaultOpen = false,
}: Readonly<FloatingActionButtonProps>) {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);

  const TriggerIcon = config.triggerIcon || ChevronDown;

  return (
    <div
      className={cn(
        "fixed z-50",
        "bottom-4 right-4 md:bottom-12 lg:right-12",
        "flex flex-col-reverse items-end gap-3",
        className
      )}
    >
      {/* Trigger Button */}
      <Button
        variant="primary"
        size="icon"
        rounded="full"
        className="w-14 h-14"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={isOpen ? "Cerrar menú" : "Abrir menú de acciones"}
      >
        <div
          className={cn(
            "transition-transform duration-500 ease-out",
            isOpen ? "rotate-90" : "rotate-0"
          )}
        >
          {isOpen ? (
            <X className="w-6 h-6" />
          ) : (
            <TriggerIcon className="w-6 h-6" />
          )}
        </div>
      </Button>

      {/* Menu Items - positioned ABOVE the trigger */}
      <div
        className={cn(
          "flex flex-col-reverse items-end gap-2",
          "transition-all duration-500 ease-out",
          isOpen ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8 pointer-events-none"
        )}
      >
        {config.items.map((item) => (
          <FabItemRow key={item.id} item={item} onClose={() => setIsOpen(false)} />
        ))}
      </div>
    </div>
  );
}

interface FabItemRowProps {
  item: FabItem;
  onClose: () => void;
}

function FabItemRow({ item, onClose }: Readonly<FabItemRowProps>) {
  const Icon = item.icon;

  return (
    <section className="flex items-center gap-2">
      <div className={cn(
        "px-4 py-2",
        "bg-surface text-foreground",
        "border border-input-border",
        "rounded-full",
        "text-sm font-medium whitespace-nowrap"
      )}>
        {item.label}
      </div>

      <Button
        variant="primary"
        size="icon"
        rounded="full"
        className="w-12 h-12 border border-input-border"
        onClick={() => {
          item.onClick?.();
          onClose();
        }}
      >
        <Icon className="w-5 h-5" />
      </Button>
    </section>
  );
}

export const DEFAULT_FAB_ITEMS = {
  payments: [
    { id: "new-payment", icon: Plus, label: "Nuevo pago" },
  ] as const,
  members: [
    { id: "new-member", icon: Users, label: "Nuevo miembro" },
  ] as const,
  routines: [
    { id: "new-routine", icon: Calendar, label: "Nueva rutina" },
  ] as const,
  reports: [
    { id: "new-report", icon: FileText, label: "Nuevo reporte" },
  ] as const,
  dashboard: [
    { id: "analytics", icon: BarChart3, label: "Estadísticas" },
  ] as const,
  settings: [
    { id: "settings", icon: Settings, label: "Configuración" },
  ] as const,
} as const;
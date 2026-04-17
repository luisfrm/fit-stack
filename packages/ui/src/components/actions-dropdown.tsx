"use client";

import * as React from "react";
import { MoreHorizontal } from "lucide-react";
import {
  Button,
  Avatar,
} from "@workspace/ui/components";
import { cn } from "@workspace/ui/lib/utils";
import { AvatarFallback, AvatarImage } from "./avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "./dropdown-menu";

export interface ActionDropdownItem<T = unknown> {
  label: string;
  icon?: React.ReactNode;
  image?: string; // Support for NextImage if provided (as requested)
  onClick?: () => void;
  href?: string;
  variant?: "default" | "destructive" | "amber" | "primary";
  className?: string;
  show?: boolean;
  /**
   * Optional Modal component that uses the trigger pattern
   */
  Modal?: React.ComponentType<{
    initialData: T;
    onSuccess: () => void;
    trigger: React.ReactNode;
  }>;
}

export interface ActionDropdownSection<T = unknown> {
  label?: string;
  items: ActionDropdownItem<T>[];
}

export interface ActionsDropdownProps<T = unknown> {
  /**
   * Custom trigger element. Defaults to a kebab menu button.
   */
  trigger?: React.ReactNode;
  /**
   * Grouped items to display in the menu.
   */
  sections: ActionDropdownSection<T>[];
  /**
   * Alignment of the menu relative to the trigger.
   */
  align?: "start" | "end" | "center";
  /**
   * Shared data passed to any item with a Modal.
   */
  modalData?: T;
  /**
   * Shared success callback for all modals.
   */
  onSuccess?: () => void;
  className?: string;
}

export function ActionsDropdown<T = unknown>({
  trigger,
  sections,
  align = "end",
  modalData,
  onSuccess,
  className,
}: Readonly<ActionsDropdownProps<T>>) {
  const renderItem = (item: ActionDropdownItem<T>, index: number) => {
    if (item.show === false) return null;

    const variantClasses = {
      default: "",
      destructive: "text-red-500 hover:bg-red-500/10 focus:bg-red-500/10 focus:text-red-500",
      amber: "text-amber-500 hover:bg-amber-500/10 focus:bg-amber-500/10 focus:text-amber-500",
      primary: "text-primary hover:bg-primary/10 focus:bg-primary/10 focus:text-primary",
    };

    const content = (
      <DropdownMenuItem
        className={cn(
          "gap-2 cursor-pointer",
          variantClasses[item.variant || "default"],
          item.className
        )}
        onClick={item.onClick}
        onSelect={item.Modal ? (e) => e.preventDefault() : undefined}
      >
        {item.image ? (
          <Avatar className="size-4 shrink-0" fallback={""}>
            <AvatarImage src={item.image} alt={item.label} />
            <AvatarFallback className="text-[10px]">{item.label.charAt(0)}</AvatarFallback>
          </Avatar>
        ) : (
          item.icon && <span className="shrink-0">{item.icon}</span>
        )}
        {item.label}
      </DropdownMenuItem>
    );

    // If item has a link
    if (item.href) {
      return (
        <DropdownMenuItem asChild key={`${item.label}-${index}`} className="p-0">
          <a
            href={item.href}
            className={cn(
              "flex w-full items-center gap-2 px-2 py-1.5 focus:bg-accent focus:text-accent-foreground",
              variantClasses[item.variant || "default"],
              item.className
            )}
          >
            {item.image ? (
              <Avatar className="size-4 shrink-0" fallback={""}>
                <AvatarImage src={item.image} alt={item.label} />
                <AvatarFallback className="text-[10px]">{item.label.charAt(0)}</AvatarFallback>
              </Avatar>
            ) : (
              item.icon && <span className="shrink-0">{item.icon}</span>
            )}
            {item.label}
          </a>
        </DropdownMenuItem>
      );
    }

    // If item has a modal wrapper
    if (item.Modal && modalData) {
      const ModalComp = item.Modal;
      return (
        <ModalComp
          key={`${item.label}-${index}`}
          initialData={modalData}
          onSuccess={onSuccess ?? (() => { })}
          trigger={content}
        />
      );
    }

    return React.cloneElement(content as React.ReactElement, { key: `${item.label}-${index}` });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {trigger || (
          <Button variant="ghost" size="icon" className={className}>
            <MoreHorizontal size={18} />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-56">
        {sections.map((section, sIdx) => (
          <React.Fragment key={section.label || sIdx}>
            {section.label && <DropdownMenuLabel>{section.label}</DropdownMenuLabel>}
            {sIdx > 0 && !section.label && <DropdownMenuSeparator />}
            {section.items.map((item, iIdx) => renderItem(item, iIdx))}
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

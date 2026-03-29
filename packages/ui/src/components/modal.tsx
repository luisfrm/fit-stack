"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@workspace/ui/components/dialog";
import { cn } from "@workspace/ui/lib/utils";

interface ModalProps {
  /**
   * The element that triggers the modal (Button, Link, etc.)
   */
  trigger: React.ReactNode;
  /**
   * Title shown in the header
   */
  title: string;
  /**
   * Optional description shown below the title
   */
  description?: string;
  /**
   * Modal content
   */
  children: React.ReactNode;
  /**
   * Optional footer content
   */
  footer?: React.ReactNode;
  /**
   * If true, content will be scrollable with a max height
   * @default true
   */
  isScrollable?: boolean;
  /**
   * Custom classes for the DialogContent
   */
  className?: string;
  /**
   * Custom classes for the content wrapper (useful for scrollable area)
   */
  contentClassName?: string;
  /**
   * Programmatic control over the modal's open state
   */
  open?: boolean;
  /**
   * Callback triggered when the open state changes
   */
  onOpenChange?: (open: boolean) => void;
}

export function Modal({
  trigger,
  title,
  description,
  children,
  footer,
  isScrollable = true,
  className,
  contentClassName,
  open,
  onOpenChange,
}: Readonly<ModalProps>) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className={cn("sm:max-w-[525px]", className)}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && (
            <DialogDescription>{description}</DialogDescription>
          )}
        </DialogHeader>

        <div
          className={cn(
            isScrollable && "max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar",
            "-mx-1 px-1",
            contentClassName
          )}
        >
          {children}
        </div>

        {footer && <DialogFooter>{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}

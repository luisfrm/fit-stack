"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { useIsMobile } from "@workspace/ui/hooks/use-is-mobile";

/* ─────────────────────────────────────────────
	 Context
───────────────────────────────────────────── */
interface ResponsiveModalContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isMobile: boolean;
}

const ResponsiveModalContext =
  React.createContext<ResponsiveModalContextValue | null>(null);

function useResponsiveModal() {
  const ctx = React.useContext(ResponsiveModalContext);
  if (!ctx) {
    throw new Error("useResponsiveModal must be used within <ResponsiveModal />");
  }
  return ctx;
}

/* ─────────────────────────────────────────────
	 Root
───────────────────────────────────────────── */
interface ResponsiveModalProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

function ResponsiveModal({
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  children,
}: ResponsiveModalProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const isMobile = useIsMobile();

  const isOpen = controlledOpen ?? uncontrolledOpen;
  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [onOpenChange]
  );

  return (
    <ResponsiveModalContext.Provider
      value={{ open: isOpen, onOpenChange: handleOpenChange, isMobile }}
    >
      <DialogPrimitive.Root open={isOpen} onOpenChange={handleOpenChange}>
        {children}
      </DialogPrimitive.Root>
    </ResponsiveModalContext.Provider>
  );
}

/* ─────────────────────────────────────────────
	 Trigger / Close (re-exports)
───────────────────────────────────────────── */
const ResponsiveModalTrigger = DialogPrimitive.Trigger;
const ResponsiveModalClose = DialogPrimitive.Close;

/* ─────────────────────────────────────────────
	 Content — swaps between bottom sheet (mobile)
	 and centered modal (desktop)
───────────────────────────────────────────── */
const CLOSE_THRESHOLD = 120; // px de arrastre para cerrar (mobile)

interface ResponsiveModalContentProps {
  /** Icon shown at the left of the header */
  icon?: React.ReactNode;
  /** Modal/sheet title */
  title: React.ReactNode;
  /** Optional subtitle shown below the title */
  subtitle?: React.ReactNode;
  /** Body content */
  children: React.ReactNode;
  className?: string;
  /** Extra classes for the scrollable body */
  bodyClassName?: string;
  /** Optional footer rendered below the body */
  footer?: React.ReactNode;
  /** Max width for the desktop modal (Tailwind class, e.g. "max-w-md") */
  desktopMaxWidth?: string;
}

function ResponsiveModalContent({
  icon,
  title,
  subtitle,
  children,
  className,
  bodyClassName,
  footer,
  desktopMaxWidth = "max-w-md",
}: ResponsiveModalContentProps) {
  const { isMobile, onOpenChange } = useResponsiveModal();

  /* ── drag-to-close state (mobile only) ── */
  const dragStartY = React.useRef<number | null>(null);
  const [dragDelta, setDragDelta] = React.useState(0);
  const [isDragging, setIsDragging] = React.useState(false);

  function onPointerDown(e: React.PointerEvent) {
    if (!isMobile) return;
    dragStartY.current = e.clientY;
    setIsDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!isDragging || dragStartY.current === null) return;
    const delta = Math.max(0, e.clientY - dragStartY.current);
    setDragDelta(delta);
  }

  function onPointerUp() {
    if (!isDragging) return;
    setIsDragging(false);
    if (dragDelta >= CLOSE_THRESHOLD) {
      onOpenChange(false);
    }
    setDragDelta(0);
    dragStartY.current = null;
  }

  /* ─────────────── MOBILE: Bottom Sheet ─────────────── */
  if (isMobile) {
    return (
      <DialogPrimitive.Portal>
        {/* Overlay */}
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px]",
            // tw-animate-css data-state animations
            "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
            "duration-300"
          )}
        />

        {/* Sheet */}
        <DialogPrimitive.Content
          style={{
            transform: dragDelta > 0 ? `translateY(${dragDelta}px)` : undefined,
            // Snap-back suave al soltar sin llegar al umbral. Los keyframes
            // de open/close animan `translate`/`opacity`, no `transform`,
            // así que esta transición no interfiere con ellos.
            transition: isDragging ? "none" : "transform 0.2s ease-out",
            opacity: dragDelta > 0 ? 1 - dragDelta / 300 : undefined,
          }}
          className={cn(
            // Layout
            "fixed bottom-0 left-0 right-0 z-50",
            "flex flex-col",
            // Visual
            "rounded-t-2xl bg-popover text-popover-foreground",
            "ring-1 ring-foreground/10",
            "shadow-[0_-8px_40px_rgba(0,0,0,0.35)]",
            // Max height
            "max-h-[90dvh]",
            // Radix data-state animations (custom keyframes en globals.css)
            "data-open:animate-sheet-in data-closed:animate-sheet-out",
            className
          )}
        >
          {/* Drag handle */}
          <div
            className="flex-shrink-0 cursor-grab active:cursor-grabbing pt-3 pb-1 touch-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onLostPointerCapture={onPointerUp}
          >
            <div className="mx-auto h-1 w-10 rounded-full bg-foreground/15" />
          </div>

          {/* Header */}
          <ModalHeader icon={icon} title={title} subtitle={subtitle} />

          {/* Body — scrollable */}
          <div
            className={cn(
              "flex-1 overflow-y-auto overscroll-contain px-5 pb-6",
              bodyClassName
            )}
          >
            {children}
          </div>

          {/* Optional footer */}
          {footer && (
            <div className="flex-shrink-0 flex flex-col-reverse gap-2 border-t border-border bg-muted/50 px-5 py-4 sm:flex-row sm:justify-end">
              {footer}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    );
  }

  /* ─────────────── DESKTOP: Centered Modal ─────────────── */
  return (
    <DialogPrimitive.Portal>
      {/* Overlay */}
      <DialogPrimitive.Overlay
        className={cn(
          "fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]",
          "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
          "duration-200"
        )}
      />

      {/* Dialog */}
      <DialogPrimitive.Content
        className={cn(
          // Centering
          "fixed left-1/2 top-1/2 z-50",
          "-translate-x-1/2 -translate-y-1/2",
          // Size
          "w-full",
          desktopMaxWidth,
          // Visual
          "rounded-2xl bg-popover text-popover-foreground",
          "shadow-2xl ring-1 ring-foreground/10",
          "flex flex-col max-h-[90dvh]",
          // Animations — keyframes custom que animan `translate`/`scale`
          // (sin chocar con el centrado `-translate-x-1/2 -translate-y-1/2`)
          "data-open:animate-modal-in data-closed:animate-modal-out",
          className
        )}
      >
        {/* Header */}
        <ModalHeader icon={icon} title={title} subtitle={subtitle} />

        {/* Body — scrollable */}
        <div
          className={cn("flex-1 overflow-y-auto px-6 pb-6", bodyClassName)}
        >
          {children}
        </div>

        {/* Optional footer */}
        {footer && (
          <div className="flex-shrink-0 flex flex-col-reverse gap-2 border-t border-border bg-muted/50 px-6 py-4 sm:flex-row sm:justify-end">
            {footer}
          </div>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/* ─────────────────────────────────────────────
	 Shared Header
───────────────────────────────────────────── */
interface ModalHeaderProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
}

function ModalHeader({ icon, title, subtitle }: ModalHeaderProps) {
  return (
    <div className="flex-shrink-0 px-5 md:px-6 pt-4 pb-3 border-b border-border">
      {/* Title row: [icon + title] ... [X] */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {icon && (
            <span className="flex-shrink-0 text-foreground-muted">{icon}</span>
          )}
          <DialogPrimitive.Title className="text-base font-semibold text-foreground truncate leading-tight">
            {title}
          </DialogPrimitive.Title>
        </div>

        {/* Close button */}
        <DialogPrimitive.Close
          className={cn(
            "flex-shrink-0 rounded-full p-1.5",
            "text-foreground-dim hover:text-foreground hover:bg-foreground/5",
            "transition-colors duration-150",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          )}
          aria-label="Cerrar"
        >
          <X className="size-4" strokeWidth={2.5} />
        </DialogPrimitive.Close>
      </div>

      {/* Optional subtitle */}
      {subtitle && (
        <DialogPrimitive.Description asChild>
          <p className="mt-0.5 text-xs text-foreground-muted leading-snug">
            {subtitle}
          </p>
        </DialogPrimitive.Description>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
	 Legacy `Modal` — misma API de siempre,
	 ahora con comportamiento responsive
───────────────────────────────────────────── */
const MODAL_SIZES = {
  sm: "sm:max-w-sm",      // 384px
  md: "sm:max-w-lg",      // 512px
  lg: "sm:max-w-xl",      // 576px
  xl: "sm:max-w-3xl",     // 768px
  "2xl": "sm:max-w-5xl",  // 1024px
  full: "sm:max-w-[95vw]",
} as const;

export type ModalSize = keyof typeof MODAL_SIZES;

interface ModalProps {
  /**
   * The element that triggers the modal (Button, Link, etc.)
   */
  trigger?: React.ReactNode;
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
   * Custom classes for the modal container (DialogContent)
   */
  className?: string;
  /**
   * Custom classes for the scrollable body
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
  /**
   * Size of the modal (desktop)
   * @default "md"
   */
  size?: ModalSize;
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
  size = "md",
}: Readonly<ModalProps>) {
  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange}>
      {trigger ? (
        <ResponsiveModalTrigger asChild>{trigger}</ResponsiveModalTrigger>
      ) : null}
      <ResponsiveModalContent
        title={title}
        subtitle={description}
        desktopMaxWidth={MODAL_SIZES[size]}
        className={className}
        bodyClassName={cn(
          isScrollable && "md:max-h-[75vh]",
          contentClassName
        )}
        footer={footer}
      >
        {children}
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}

/* ─────────────────────────────────────────────
	 Exports
───────────────────────────────────────────── */
export {
  ResponsiveModal,
  ResponsiveModalTrigger,
  ResponsiveModalClose,
  ResponsiveModalContent,
};

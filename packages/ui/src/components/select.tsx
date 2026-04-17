"use client"

import * as React from "react"
import { Select as SelectPrimitive } from "radix-ui"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@workspace/ui/lib/utils"
import { ChevronDownIcon, CheckIcon, ChevronUpIcon } from "lucide-react"

/* ─────────────────────────────────────────────
   TRIGGER VARIANTS
   ───────────────────────────────────────────── */
const selectTriggerVariants = cva(
  [
    "flex w-full items-center justify-between gap-2",
    "border rounded-md",
    "transition-all duration-200",
    "outline-none select-none",
    "text-sm font-medium",
    "disabled:cursor-not-allowed disabled:opacity-40",
  ],
  {
    variants: {
      variant: {
        /**
         * default — dark surface matching Input's appearance
         */
        default: [
          "bg-surface border-border",
          "focus:border-primary focus:ring-1 focus:ring-primary",
          "data-[state=open]:border-primary data-[state=open]:ring-1 data-[state=open]:ring-primary",
        ],
        /**
         * glass — subtle translucent surface (formerly filled)
         */
        glass: [
          "bg-white/5 border-white/10",
          "focus:border-primary focus:ring-1 focus:ring-primary",
          "data-[state=open]:border-primary data-[state=open]:ring-1 data-[state=open]:ring-primary",
        ],
      },

      size: {
        sm:   "h-10 px-4",
        base: "h-12 px-4",
        md:   "h-14 px-4",
        lg:   "h-16 px-4",
      },

      state: {
        default: "",
        error:   "border-red-500 focus:border-red-500 focus:ring-red-500",
      },
    },

    defaultVariants: {
      variant: "default",
      size:    "base",
      state:   "default",
    },
  }
)

/* ─────────────────────────────────────────────
   COMPONENTS
   ───────────────────────────────────────────── */

function Select({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Root>) {
  return <SelectPrimitive.Root data-slot="select" {...props} />
}

function SelectGroup({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Group>) {
  return (
    <SelectPrimitive.Group
      data-slot="select-group"
      className={cn("scroll-my-1 p-1", className)}
      {...props}
    />
  )
}

function SelectValue({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />
}

export interface SelectTriggerProps
  extends React.ComponentProps<typeof SelectPrimitive.Trigger>,
    VariantProps<typeof selectTriggerVariants> {}

const SelectTrigger = React.forwardRef<HTMLButtonElement, SelectTriggerProps>(
  ({ className, variant, size, state, children, ...props }, ref) => {
    return (
      <SelectPrimitive.Trigger
        ref={ref}
        data-slot="select-trigger"
        className={cn(selectTriggerVariants({ variant, size, state }), className)}
        {...props}
      >
        <div className="flex items-center gap-2 overflow-hidden">
          {children}
        </div>
        <SelectPrimitive.Icon asChild>
          <ChevronDownIcon className="size-4 text-white/30 shrink-0" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
    )
  }
)
SelectTrigger.displayName = "SelectTrigger"

function SelectContent({
  className,
  children,
  position = "popper",
  align = "start",
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        className={cn(
          "relative z-50 max-h-(--radix-select-content-available-height) min-w-(--radix-select-trigger-width) overflow-hidden rounded-md border border-border bg-surface text-foreground shadow-xl animate-in fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
          position === "popper" && "data-[side=bottom]:translate-y-1 data-[side=top]:-translate-y-1",
          className
        )}
        position={position}
        align={align}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport
          className={cn(
            "p-1",
            position === "popper" && "h-(--radix-select-content-available-height) w-full min-w-(--radix-select-trigger-width)"
          )}
        >
          {children}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

function SelectLabel({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      data-slot="select-label"
      className={cn("px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-white/40", className)}
      {...props}
    />
  )
}

function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex w-full cursor-default items-center rounded-sm py-2 pl-3 pr-9 text-sm outline-none transition-colors focus:bg-white/5 focus:text-primary data-disabled:pointer-events-none data-disabled:opacity-50 select-none",
        className
      )}
      {...props}
    >
      <span className="absolute right-3 flex h-3.5 w-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className="size-4 text-primary" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}

function SelectSeparator({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("-mx-1 my-1 h-px bg-white/5", className)}
      {...props}
    />
  )
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpButton>) {
  return (
    <SelectPrimitive.ScrollUpButton
      data-slot="select-scroll-up-button"
      className={cn("flex cursor-default items-center justify-center py-1 text-white/30", className)}
      {...props}
    >
      <ChevronUpIcon className="size-4" />
    </SelectPrimitive.ScrollUpButton>
  )
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownButton>) {
  return (
    <SelectPrimitive.ScrollDownButton
      data-slot="select-scroll-down-button"
      className={cn("flex cursor-default items-center justify-center py-1 text-white/30", className)}
      {...props}
    >
      <ChevronDownIcon className="size-4" />
    </SelectPrimitive.ScrollDownButton>
  )
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}

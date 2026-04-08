import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot, Slottable } from "@radix-ui/react-slot"
import { Spinner } from "@workspace/ui/components/spinner"

import { cn } from "@workspace/ui/lib/utils"

const buttonVariants = cva(
  // Base styles shared by all variants
  [
    "inline-flex items-center justify-center gap-2",
    "font-bold uppercase tracking-wider",
    "rounded-sm",
    "transition-all duration-300 ease-in-out",
    "cursor-pointer select-none",
    "disabled:opacity-40 disabled:pointer-events-none",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[--color-primary]",
  ],
  {
    variants: {
      variant: {
        /**
         * Primary — yellow background, black text
         * Use for main CTA actions
         */
        primary: [
          "bg-primary text-black",
          "hover:bg-yellow-400",
          "active:scale-[0.98]",
        ],

        /**
         * Outlined — transparent with white border, inverts on hover
         * Use for secondary actions
         */
        outlined: [
          "bg-transparent text-white",
          "border-2 border-white",
          "hover:bg-white hover:text-black",
        ],

        /**
         * Ghost — subtle, no border
         * Use for tertiary actions or nav items
         */
        ghost: [
          "bg-transparent text-white",
          "hover:bg-white/10",
        ],

        /**
         * Glass — translucent panel style
         */
        glass: [
          "bg-[--color-glass-bg] backdrop-blur-md",
          "border border-border",
          "text-white",
          "hover:border-[--color-primary] hover:bg-white/10",
        ],

        /**
         * Danger — for destructive actions
         */
        danger: [
          "bg-red-600 text-white",
          "hover:bg-red-500",
        ],

        /**
         * Link — looks like a hyperlink
         */
        link: [
          "bg-transparent text-primary hover:underline",
          "p-0 h-auto font-bold normal-case tracking-normal",
        ],

        /**
         * Ghost Danger — subtle red, no border
         */
        "ghost-danger": [
          "bg-transparent text-red-500",
          "hover:bg-red-500/10",
        ],

        /**
         * Ghost Muted — subtle white, used for input icons
         */
        "ghost-muted": [
          "bg-transparent text-white/40",
          "hover:text-white hover:bg-white/5 active:bg-white/10",
        ],
      },

      size: {
        xs: "text-[10px] px-3 py-1.5 tracking-[0.15em]",
        sm: "text-xs px-5 py-2.5",
        md: "text-sm px-6 py-3",
        lg: "text-base px-8 py-4",
        xl: "text-lg px-10 py-4 tracking-[0.15em]",
        icon: "p-2 flex items-center justify-center shrink-0",
      },

      fullWidth: {
        true: "w-full",
        false: "w-auto",
      },

      rounded: {
        default: "rounded-sm",
        full: "rounded-full",
        lg: "rounded-lg",
      },
    },

    defaultVariants: {
      variant: "primary",
      size: "md",
      fullWidth: false,
      rounded: "default",
    },
  }
);

/* ─────────────────────────────────────────────
   TYPES
   ───────────────────────────────────────────── */
export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
  VariantProps<typeof buttonVariants> {
  /**
   * If true, the button will render as its child, merging props and styles
   */
  asChild?: boolean;
  /**
   * Icon to render before the label
   */
  leftIcon?: React.ReactNode;
  /**
   * Icon to render after the label
   */
  rightIcon?: React.ReactNode;
  /**
   * Shows a loading spinner and disables the button
   */
  loading?: boolean;
}

/* ─────────────────────────────────────────────
   COMPONENT
   ───────────────────────────────────────────── */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      fullWidth,
      rounded,
      leftIcon,
      rightIcon,
      loading = false,
      asChild = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : "button";

    return (
      <Comp
        ref={ref}
        className={cn(
          buttonVariants({ variant, size, fullWidth, rounded }),
          className
        )}
        disabled={disabled || loading}
        {...props}
      >
        {loading && <Spinner className="size-4" />}
        {!loading && leftIcon && <span className="shrink-0">{leftIcon}</span>}
        {!loading && <Slottable>{children}</Slottable>}
        {!loading && rightIcon && <span className="shrink-0">{rightIcon}</span>}
      </Comp>
    );
  }
);

Button.displayName = "Button";

export { Button, buttonVariants };
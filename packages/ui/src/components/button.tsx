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
    "rounded-md",
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
          "bg-primary text-primary-foreground",
          "hover:bg-primary-hover",
          "active:scale-[0.98]",
        ],

        /**
         * Outlined — transparent with white border, inverts on hover
         * Use for secondary actions
         */
        outlined: [
          "bg-transparent text-foreground",
          "border-2 border-foreground",
          "hover:bg-foreground hover:text-background",
        ],

        /**
         * Ghost — subtle, no border
         * Use for tertiary actions or nav items
         */
        ghost: [
          "bg-transparent text-foreground",
          "hover:bg-input-hover",
        ],

        /**
         * Secondary — matches input surface
         */
        secondary: [
          "bg-input border border-input-border text-foreground",
          "hover:bg-input-hover",
        ],

        /**
         * glass — translucent surface matching inputs
         */
        glass: [
          "bg-foreground/5 border border-border text-foreground",
          "hover:bg-foreground/10 hover:border-border",
          "active:scale-[0.98]",
        ],

        /**
         * Danger — for destructive actions
         */
        danger: [
          "bg-destructive text-destructive-foreground",
          "hover:bg-destructive/90",
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
          "bg-transparent text-destructive",
          "hover:bg-destructive/10",
        ],

        /**
         * Ghost Accent — muted text, primary-glow bg on hover
         */
        "ghost-accent": [
          "bg-transparent text-muted-foreground",
          "hover:bg-primary/30 hover:text-foreground",
        ],

        /**
         * Ghost Muted — subtle white, used for input icons
         */
        "ghost-muted": [
          "bg-transparent text-foreground-muted",
          "hover:text-foreground hover:bg-input-hover active:bg-foreground/10",
        ],

        /**
         * white — background white, text black (Premium CTA)
         */
        white: [
          "bg-white text-black",
          "hover:bg-slate-200",
          "active:scale-[0.95]",
        ],
      },

      size: {
        xs: "text-[10px] px-3 h-8 tracking-[0.15em]",
        sm: "text-xs px-5 h-10",
        md: "text-sm px-6 h-12",
        lg: "text-base px-8 h-14",
        xl: "text-lg px-10 h-16 tracking-[0.15em]",
        icon: "p-2 flex items-center justify-center shrink-0",
      },

      fullWidth: {
        true: "w-full",
        false: "w-auto",
      },

      rounded: {
        default: "rounded-md",
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
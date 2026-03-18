import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "@radix-ui/react-slot"

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
          "border border-[--color-border]",
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
      },

      size: {
        xs:  "text-[10px] px-3 py-1.5 tracking-[0.15em]",
        sm:  "text-xs px-5 py-2.5",
        md:  "text-sm px-6 py-3",
        lg:  "text-base px-8 py-4",
        xl:  "text-lg px-10 py-4 tracking-[0.15em]",
        icon: "size-10 p-0 rounded-full",
      },

      fullWidth: {
        true:  "w-full",
        false: "w-auto",
      },

      rounded: {
        default: "rounded-sm",
        full:    "rounded-full",
        lg:      "rounded-lg",
      },
    },

    defaultVariants: {
      variant:   "primary",
      size:      "md",
      fullWidth: false,
      rounded:   "default",
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
        {loading ? (
          <LoadingSpinner />
        ) : (
          <>
            {leftIcon && <span className="shrink-0">{leftIcon}</span>}
            {children}
            {rightIcon && <span className="shrink-0">{rightIcon}</span>}
          </>
        )}
      </Comp>
    );
  }
);

Button.displayName = "Button";

/* ─────────────────────────────────────────────
   INTERNAL: Loading Spinner
   ───────────────────────────────────────────── */
function LoadingSpinner() {
  return (
    <svg
      className="size-4 animate-spin"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

export { Button, buttonVariants };
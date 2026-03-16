import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@workspace/ui/lib/utils"

/* ─────────────────────────────────────────────
   WRAPPER VARIANTS
   ───────────────────────────────────────────── */
const inputWrapperVariants = cva(
  [
    "relative flex items-center",
    "border rounded-lg",
    "transition-all duration-200",
    "focus-within:outline-none",
  ],
  {
    variants: {
      variant: {
        /**
         * default — glass/dark surface, border glows on focus (used for CMS forms)
         */
        default: [
          "bg-transparent border-white/20",
          "focus-within:border-[--color-primary] focus-within:ring-1 focus-within:ring-[--color-primary]",
        ],
        /**
         * filled — slightly elevated surface
         */
        filled: [
          "bg-white/5 border-white/10",
          "focus-within:border-[--color-primary] focus-within:ring-1 focus-within:ring-[--color-primary]",
        ],
      },

      inputSize: {
        sm: "h-10",
        md: "h-14",
        lg: "h-16",
      },

      state: {
        default: "",
        error:   "border-red-500 focus-within:border-red-500 focus-within:ring-red-500",
        success: "border-green-500 focus-within:border-green-500 focus-within:ring-green-500",
      },
    },

    defaultVariants: {
      variant:   "default",
      inputSize: "md",
      state:     "default",
    },
  }
)

/* ─────────────────────────────────────────────
   TYPES
   ───────────────────────────────────────────── */
export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size">,
    VariantProps<typeof inputWrapperVariants> {
  /**
   * Icon rendered on the left side of the input.
   * Pass any React node, e.g. a Lucide icon: <Mail size={16} />
   */
  leftIcon?: React.ReactNode
  /**
   * Icon or button rendered on the right side of the input.
   * Pass any React node. For password toggles, pass an <button> element.
   */
  rightElement?: React.ReactNode
  /**
   * Visible label rendered above the input
   */
  label?: string
  /**
   * Helper or error message rendered below the input
   */
  hint?: string
  /** Override wrapper className */
  wrapperClassName?: string
}

/* ─────────────────────────────────────────────
   COMPONENT
   ───────────────────────────────────────────── */
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      variant,
      inputSize,
      state,
      leftIcon,
      rightElement,
      label,
      hint,
      className,
      wrapperClassName,
      id,
      disabled,
      ...props
    },
    ref
  ) => {
    const generatedId = React.useId()
    const inputId = id ?? generatedId

    return (
      <div className="flex flex-col gap-1.5 w-full">
        {/* Label */}
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium tracking-wide text-white/70 select-none"
          >
            {label}
          </label>
        )}

        {/* Wrapper */}
        <div
          className={cn(
            inputWrapperVariants({ variant, inputSize, state }),
            disabled && "opacity-40 pointer-events-none",
            wrapperClassName
          )}
        >
          {/* Left icon */}
          {leftIcon && (
            <span className="pl-4 shrink-0 text-white/40 flex items-center">
              {leftIcon}
            </span>
          )}

          {/* Input */}
          <input
            ref={ref}
            id={inputId}
            disabled={disabled}
            className={cn(
              "flex-1 bg-transparent outline-none",
              "px-4 h-full",
              "text-white placeholder:text-white/30",
              "text-sm",
              leftIcon  && "pl-2",
              rightElement && "pr-2",
              className
            )}
            {...props}
          />

          {/* Right element */}
          {rightElement && (
            <span className="pr-4 shrink-0 text-white/40 flex items-center">
              {rightElement}
            </span>
          )}
        </div>

        {/* Hint / error message */}
        {hint && (
          <p
            className={cn(
              "text-xs",
              state === "error"   && "text-red-400",
              state === "success" && "text-green-400",
              (!state || state === "default") && "text-white/40"
            )}
          >
            {hint}
          </p>
        )}
      </div>
    )
  }
)

Input.displayName = "Input"

export { Input, inputWrapperVariants }

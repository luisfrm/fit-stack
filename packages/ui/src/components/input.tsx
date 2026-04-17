import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { CircleX } from "lucide-react"
import { cn } from "@workspace/ui/lib/utils"
import { Spinner } from "@workspace/ui/components/spinner"
import { Label } from "@workspace/ui/components/label"

/* ─────────────────────────────────────────────
   WRAPPER VARIANTS
   ───────────────────────────────────────────── */
const inputWrapperVariants = cva(
  [
    "relative flex items-center",
    "border rounded-md",
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
          "bg-input border-input-border",
          "focus-within:border-primary focus-within:ring-1 focus-within:ring-primary",
        ],
        /**
         * glass — subtle translucent surface (formerly filled)
         */
        glass: [
          "bg-white/5 border-white/10",
          "focus-within:border-primary focus-within:ring-1 focus-within:ring-primary",
        ],
      },

      inputSize: {
        sm: "h-10",
        base: "h-12",
        md: "h-14",
        lg: "h-16",
      },

      state: {
        default: "",
        error: "border-red-500 focus-within:border-red-500 focus-within:ring-red-500",
        success: "border-green-500 focus-within:border-green-500 focus-within:ring-green-500",
        loading: "",
      },
    },

    defaultVariants: {
      variant: "default",
      inputSize: "base",
      state: "default",
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

    let renderRightElement = null
    if (state === "error") {
      renderRightElement = (
        <span className="pr-4 shrink-0 flex items-center text-red-500">
          <CircleX size={16} />
        </span>
      )
    } else if (state === "loading") {
      renderRightElement = (
        <span className="pr-4 shrink-0 flex items-center text-white/30">
          <Spinner className="size-4" />
        </span>
      )
    } else if (rightElement) {
      renderRightElement = (
        <span className="pr-4 shrink-0 flex items-center text-white/30">
          {rightElement}
        </span>
      )
    }

    return (
      <div className="flex flex-col gap-1.5 w-full">
        {/* Label */}
        {label && (
          <Label
            htmlFor={inputId}
            className="text-xs font-semibold uppercase tracking-wider text-gray-400"
          >
            {label}
          </Label>
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
            <span className="pl-4 shrink-0 flex items-center text-white/30">
              {leftIcon}
            </span>
          )}

          {/* Input */}
          <input
            ref={ref}
            id={inputId}
            disabled={disabled}
            className={cn(
              "flex-1 bg-transparent outline-none border-none shadow-none px-4 h-full text-sm text-white placeholder-gray-600 min-w-0",
              "autofill:bg-transparent autofill:transition-colors autofill:duration-[5000s] autofill:[-webkit-text-fill-color:white]",
              leftIcon && "pl-2",
              renderRightElement && "pr-2",
              className
            )}
            {...props}
          />

          {/* Right element / Error Icon */}
          {renderRightElement}
        </div>

        {/* Hint / error message */}
        {hint && (
          <p
            className={cn(
              "text-xs",
              state === "error" && "text-red-400",
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

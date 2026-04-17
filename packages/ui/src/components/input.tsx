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
          "hover:bg-foreground/4",
          "focus-within:border-primary focus-within:ring-1 focus-within:ring-primary focus-within:hover:bg-input",
        ],
        /**
         * glass — subtle translucent surface (formerly filled)
         */
        glass: [
          "bg-foreground/5 border-border",
          "hover:bg-foreground/8 hover:border-border",
          "focus-within:border-primary focus-within:ring-1 focus-within:ring-primary focus-within:hover:bg-foreground/5",
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
  /**
   * If false, prevents typing or pasting negative values.
   * Only applies when type="number"
   * @default true
   */
  allowNegative?: boolean
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
      type,
      allowNegative = true,
      onKeyDown,
      onChange,
      ...props
    },
    ref
  ) => {
    const generatedId = React.useId()
    const inputId = id ?? generatedId

    let renderRightElement = null
    if (state === "error") {
      renderRightElement = (
        <span className="pr-4 shrink-0 flex items-center text-destructive">
          <CircleX size={16} />
        </span>
      )
    } else if (state === "loading") {
      renderRightElement = (
        <span className="pr-4 shrink-0 flex items-center text-foreground-muted">
          <Spinner className="size-4" />
        </span>
      )
    } else if (rightElement) {
      renderRightElement = (
        <span className="pr-4 shrink-0 flex items-center text-foreground-muted">
          {rightElement}
        </span>
      )
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (type === "number" && !allowNegative && (e.key === "-" || e.key === "e")) {
        e.preventDefault()
      }
      onKeyDown?.(e)
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (type === "number") {
        const raw = e.target.value
        // Strip leading zeros (e.g. "02" → "2"), but allow "0" and "0.x"
        if (raw.length > 1 && raw.startsWith("0") && !raw.startsWith("0.")) {
          e.target.value = raw.replace(/^0+/, "") || "0"
        }
      }
      onChange?.(e)
    }

    return (
      <div className="flex flex-col gap-1.5 w-full">
        {/* Label */}
        {label && (
          <Label
            htmlFor={inputId}
            className="text-xs font-semibold uppercase tracking-wider text-foreground-muted"
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
            <span className="pl-4 shrink-0 flex items-center text-foreground-muted">
              {leftIcon}
            </span>
          )}

          {/* Input */}
          <input
            ref={ref}
            id={inputId}
            type={type}
            disabled={disabled}
            onKeyDown={handleKeyDown}
            onChange={handleChange}
            min={type === "number" && !allowNegative ? 0 : props.min}
            className={cn(
              "flex-1 bg-transparent outline-none border-none shadow-none px-4 h-full text-sm text-foreground placeholder:text-foreground-dim min-w-0",
              "autofill:bg-transparent autofill:transition-colors autofill:duration-[5000s] autofill:[-webkit-text-fill-color:var(--color-foreground)]",
              "appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
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
              "text-xs font-medium",
              state === "error" && "text-destructive",
              state === "success" && "text-primary",
              (!state || state === "default") && "text-foreground-dim"
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

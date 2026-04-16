import * as React from "react"
import { cn } from "@workspace/ui/lib/utils"
import { Label } from "./label"
import { inputWrapperVariants } from "./input"
import { type VariantProps } from "class-variance-authority"

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement>,
  VariantProps<typeof inputWrapperVariants> {
  label?: string
  hint?: string
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, hint, variant = "default", state, id, disabled, ...props }, ref) => {
    const generatedId = React.useId()
    const textareaId = id ?? generatedId

    return (
      <div className="flex flex-col gap-1.5 w-full">
        {label && (
          <Label
            htmlFor={textareaId}
            className="text-xs font-semibold uppercase tracking-wider text-gray-400"
          >
            {label}
          </Label>
        )}
        <div
          className={cn(
            inputWrapperVariants({ variant, state }),
            "min-h-[120px] transition-all",
            className
          )}
        >
          <textarea
            id={textareaId}
            className={cn(
              "flex-1 w-full bg-transparent outline-none border-none shadow-none px-4 py-3 text-sm text-white placeholder-gray-600 min-w-0 resize-y",
              disabled && "cursor-not-allowed opacity-50"
            )}
            disabled={disabled}
            ref={ref}
            {...props}
          />
        </div>
        {hint && (
          <p className={cn("text-xs", state === "error" ? "text-red-400" : "text-white/40")}>
            {hint}
          </p>
        )}
      </div>
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }

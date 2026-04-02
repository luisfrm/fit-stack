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
  ({ className, label, hint, variant = "default", state, id, ...props }, ref) => {
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
        <textarea
          id={textareaId}
          className={cn(
            inputWrapperVariants({ variant, state }),
            "min-h-[120px] w-full px-4 py-3 bg-transparent text-sm placeholder:text-gray-600 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 transition-colors",
            className
          )}
          ref={ref}
          {...props}
        />
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

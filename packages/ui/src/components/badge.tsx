import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@workspace/ui/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground border-primary/20 hover:bg-primary-hover shadow-xs",
        secondary:
          "bg-surface-2 text-foreground-muted border-border hover:bg-surface-2/80 hover:text-foreground",
        destructive:
          "bg-destructive/10 text-destructive border-destructive/20 focus-visible:ring-destructive/20 [a]:hover:bg-destructive/20",
        outline:
          "border-border text-foreground bg-transparent [a]:hover:bg-muted [a]:hover:text-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        success:
          "bg-success/10 text-success border-success/20 focus-visible:ring-success/20 [a]:hover:bg-success/20",
        warning:
          "bg-warning/10 text-warning border-warning/25 focus-visible:ring-warning/20 [a]:hover:bg-warning/20",
        info:
          "bg-info/10 text-info border-info/20 focus-visible:ring-info/20 [a]:hover:bg-info/20",
      },
      size: {
        sm: "h-4 px-1.5 text-[10px] leading-none",
        md: "h-5 px-2 py-0.5 text-xs leading-none",
        lg: "h-6 px-3 py-1 text-sm leading-none",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  }
)

function Badge({
  className,
  variant = "default",
  size = "md",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      data-size={size}
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }

import { cn } from "@workspace/ui/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "animate-shimmer rounded-md bg-white/20",
        "bg-linear-to-r from-transparent via-white/10 to-transparent bg-[length:200%_100%]",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }

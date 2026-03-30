import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@workspace/ui/lib/utils";

/* ─────────────────────────────────────────────
   CARD VARIANTS
   ───────────────────────────────────────────── */
const serviceCardVariants = cva(
  [
    // Base layout
    "relative flex flex-col gap-6 p-8 rounded-xl",
    // Glass base
    "bg-[--color-glass-bg] backdrop-blur-md",
    "border",
    // Transitions
    "transition-all duration-300 ease-in-out",
    "group",
  ],
  {
    variants: {
      /**
       * variant — visual treatment of the card
       *
       * default   → glass with subtle border, border glows on hover
       * featured  → pre-highlighted border (used for the "middle" card)
       * solid     → solid surface background, no glass
       */
      variant: {
        default:  [
          "border-[--color-border]",
          "hover:border-[--color-border-primary]",
        ],
        featured: [
          "border-[--color-border-primary]",
          "hover:border-[--color-primary]",
          "shadow-[0_0_40px_var(--color-primary-glow)]",
          "hover:shadow-[0_0_60px_var(--color-primary-glow-hover)]",
        ],
        solid: [
          "bg-[--color-surface-2] border-[--color-border-muted]",
          "hover:border-[--color-border-primary]",
        ],
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

/* ─────────────────────────────────────────────
   TYPES
   ───────────────────────────────────────────── */
export interface ServiceCardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof serviceCardVariants> {
  /**
   * Material Symbol icon name (e.g. "monitor_heart", "fitness_center")
   */
  icon: string;
  title: string;
  description: string;
  /**
   * Optional CTA label — renders a subtle link at the bottom
   */
  cta?: string;
  onCtaClick?: () => void;
}

/* ─────────────────────────────────────────────
   COMPONENT
   ───────────────────────────────────────────── */
const ServiceCard = React.forwardRef<HTMLDivElement, ServiceCardProps>(
  (
    {
      icon,
      title,
      description,
      cta,
      onCtaClick,
      variant,
      className,
      ...props
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={cn(serviceCardVariants({ variant }), className)}
        {...props}
      >
        {/* Icon */}
        <span
          className={cn(
            "material-symbols-outlined",
            "text-5xl text-[--color-primary]",
            "inline-block",
            // Scale on card hover
            "transition-transform duration-300",
            "group-hover:scale-110"
          )}
          aria-hidden="true"
        >
          {icon}
        </span>

        {/* Content */}
        <div className="flex flex-col gap-3 flex-1">
          <h4 className="text-2xl font-bold leading-tight">{title}</h4>
          <p className="text-[--color-foreground-muted] leading-relaxed text-sm">
            {description}
          </p>
        </div>

        {/* Optional CTA */}
        {cta && (
          <button
            onClick={onCtaClick}
            className={cn(
              "mt-2 self-start",
              "text-xs font-bold uppercase tracking-widest",
              "text-[--color-primary] opacity-0",
              "flex items-center gap-1",
              "transition-all duration-300",
              "group-hover:opacity-100 group-hover:gap-2",
              // Re-using material icon inline
              "after:content-['arrow_forward'] after:font-['Material_Symbols_Outlined'] after:text-sm"
            )}
          >
            {cta}
          </button>
        )}

        {/* Bottom accent line — animates width on hover */}
        <span
          className={cn(
            "absolute bottom-0 left-0",
            "h-[2px] w-0 rounded-full",
            "bg-[--color-primary]",
            "transition-all duration-500",
            "group-hover:w-full"
          )}
          aria-hidden="true"
        />
      </div>
    );
  }
);

ServiceCard.displayName = "ServiceCard";

export { ServiceCard, serviceCardVariants };
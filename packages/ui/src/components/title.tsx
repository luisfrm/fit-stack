import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@workspace/ui/lib/utils";

/* ─────────────────────────────────────────────
   TITLE VARIANTS
   ───────────────────────────────────────────── */
const titleVariants = cva(
  ["font-black italic uppercase tracking-tighter leading-tight"],
  {
    variants: {
      /**
       * size — controls font scale
       *
       * hero    → landing / hero fullscreen blocks
       * section → standard section headings (h2/h3)
       * card    → inside card components
       * sm      → small labels / sub-headings
       */
      size: {
        hero: "text-6xl md:text-8xl",
        section: "text-4xl md:text-5xl",
        card: "text-2xl",
        sm: "text-xl",
        lg: "text-3xl",
      },

      /**
       * accent — applies the yellow highlight to a specific word.
       * This is a layout hint; use the <TitleAccent> sub-component for the
       * colored word, or pass `accent` to colour the entire title.
       */
      accent: {
        none: "text-foreground-strong",
        primary: "text-[--color-primary]",
        muted: "text-[--color-foreground-muted]",
      },
    },

    defaultVariants: {
      size: "section",
      accent: "none",
    },
  }
);

/* ─────────────────────────────────────────────
   EYEBROW VARIANTS — small label above heading
   ───────────────────────────────────────────── */
const eyebrowVariants = cva(
  ["font-bold uppercase tracking-[0.25em] block"],
  {
    variants: {
      accent: {
        primary: "text-[--color-primary]",
        muted: "text-[--color-foreground-muted]",
        white: "text-white",
      },
      size: {
        sm: "text-xs",
        md: "text-sm",
      },
    },
    defaultVariants: {
      accent: "primary",
      size: "sm",
    },
  }
);

/* ─────────────────────────────────────────────
   TYPES
   ───────────────────────────────────────────── */
type TitleElement = "h1" | "h2" | "h3" | "h4" | "h5" | "h6";

export interface TitleProps
  extends React.HTMLAttributes<HTMLHeadingElement>,
  VariantProps<typeof titleVariants> {
  as?: TitleElement;
}

export interface EyebrowProps
  extends React.HTMLAttributes<HTMLSpanElement>,
  VariantProps<typeof eyebrowVariants> { }

/* ─────────────────────────────────────────────
   COMPONENTS
   ───────────────────────────────────────────── */

/**
 * Title — main section/page heading
 *
 * @example
 * <Title as="h2" size="section">
 *   EXCELENCIA EN CADA <TitleAccent>ÁREA</TitleAccent>
 * </Title>
 */
const Title = React.forwardRef<HTMLHeadingElement, TitleProps>(
  ({ as: Tag = "h2", size, accent, className, children, ...props }, ref) => {
    return (
      <Tag
        ref={ref}
        className={cn(titleVariants({ size, accent }), "text-foreground", className)}
        {...props}
      >
        {children}
      </Tag>
    );
  }
);
Title.displayName = "Title";

/**
 * TitleAccent — wraps a word inside <Title> to apply the primary color
 *
 * @example
 * <Title>DOMINA TU <TitleAccent>DESTINO</TitleAccent></Title>
 */
const TitleAccent = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, children, ...props }, ref) => (
    <span
      ref={ref}
      className={cn("text-[--color-primary]", className)}
      {...props}
    >
      {children}
    </span>
  )
);
TitleAccent.displayName = "TitleAccent";

/**
 * Eyebrow — small label displayed above a Title
 *
 * @example
 * <Eyebrow>Nuestros Servicios</Eyebrow>
 * <Title>EXCELENCIA EN CADA ÁREA</Title>
 */
const Eyebrow = React.forwardRef<HTMLSpanElement, EyebrowProps>(
  ({ accent, size, className, children, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(eyebrowVariants({ accent, size }), "mb-2", className)}
      {...props}
    >
      {children}
    </span>
  )
);
Eyebrow.displayName = "Eyebrow";

/**
 * SectionHeader — convenient wrapper that groups Eyebrow + Title + description
 */
interface SectionHeaderProps {
  readonly eyebrow?: string;
  readonly title: React.ReactNode;
  readonly description?: string;
  readonly align?: "left" | "center" | "right";
  readonly size?: VariantProps<typeof titleVariants>["size"];
  readonly className?: string;
}

function SectionHeader({
  eyebrow,
  title,
  description,
  align = "left",
  size = "section",
  className,
}: SectionHeaderProps) {
  const alignClass = {
    left: "text-left",
    center: "text-center items-center",
    right: "text-right items-end",
  }[align];

  return (
    <div className={cn("flex flex-col", alignClass, "mb-16 gap-4", className)}>
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <Title as="h2" size={size}>
        {title}
      </Title>
      {description && (
        <p className="text-[--color-foreground-muted] max-w-md leading-relaxed text-base">
          {description}
        </p>
      )}
    </div>
  );
}

export { Title, TitleAccent, Eyebrow, SectionHeader, titleVariants, eyebrowVariants };
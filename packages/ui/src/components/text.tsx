import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@workspace/ui/lib/utils";

/* ─────────────────────────────────────────────
   TEXT VARIANTS
   ───────────────────────────────────────────── */

/**
 * Covers every <p>, <span>, <label>, and general text element.
 *
 * size      → font-size scale
 * variant   → semantic color role
 * weight    → font-weight override
 * uppercase → letter-spacing + text transform
 * truncate  → single-line overflow ellipsis
 */
const textVariants = cva(["leading-normal"], {
  variants: {
    size: {
      xs:   "text-[10px]",
      sm:   "text-xs",
      base: "text-sm",
      md:   "text-base",
      lg:   "text-lg",
    },
    variant: {
      default: "text-slate-100",
      muted:   "text-slate-400",
      subtle:  "text-slate-500",
      primary: "text-primary",
      success: "text-emerald-400",
      danger:  "text-rose-400",
    },
    weight: {
      normal:   "font-normal",
      medium:   "font-medium",
      semibold: "font-semibold",
      bold:     "font-bold",
    },
    uppercase: {
      true:  "uppercase tracking-wide",
      false: "",
    },
    truncate: {
      true:  "truncate",
      false: "",
    },
    italic: {
      true:  "italic",
      false: "",
    },
  },
  defaultVariants: {
    size:      "base",
    variant:   "default",
    weight:    "normal",
    uppercase: false,
    truncate:  false,
    italic:    false,
  },
});

/* ─────────────────────────────────────────────
   TYPES
   ───────────────────────────────────────────── */

type TextElement = "p" | "span" | "label" | "div" | "small";

export interface TextProps
  extends Omit<React.HTMLAttributes<HTMLElement>, "color">,
    VariantProps<typeof textVariants> {
  as?: TextElement;
  htmlFor?: string;
}

/* ─────────────────────────────────────────────
   COMPONENT
   ───────────────────────────────────────────── */

/**
 * Text — universal typography primitive
 *
 * @example
 * <Text variant="muted">Bienvenido de nuevo</Text>
 * <Text as="span" size="xs" variant="subtle" uppercase>Hace 15 min</Text>
 */
function Text({
  as: Tag = "p",
  size,
  variant,
  weight,
  uppercase,
  truncate,
  italic,
  className,
  children,
  ...props
}: Readonly<TextProps>) {
  return (
    <Tag
      className={cn(textVariants({ size, variant, weight, uppercase, truncate, italic }), className)}
      {...(props as React.HTMLAttributes<HTMLElement>)}
    >
      {children}
    </Tag>
  );
}

Text.displayName = "Text";

export { Text, textVariants };

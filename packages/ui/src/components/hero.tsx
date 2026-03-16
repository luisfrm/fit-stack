import * as React from "react";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";
import { Title, TitleAccent, Eyebrow } from "@workspace/ui/components/title";

/* ─────────────────────────────────────────────
   TYPES
   ───────────────────────────────────────────── */
export interface HeroProps {
  /**
   * Small label rendered above the main heading
   */
  eyebrow?: string;
  /**
   * Main heading text. Wrap words in <TitleAccent> for yellow highlight.
   * If a string is passed, use `accentWord` to highlight a specific word automatically.
   */
  heading: React.ReactNode;
  /**
   * Word to highlight in yellow — only used when `heading` is a plain string.
   */
  accentWord?: string;
  /**
   * Supporting paragraph text
   */
  description?: string;
  /**
   * Primary CTA button label (yellow, variant="primary")
   */
  primaryCta?: string;
  onPrimaryCtaClick?: () => void;
  /**
   * Secondary CTA button label (outlined, variant="outlined")
   */
  secondaryCta?: string;
  onSecondaryCtaClick?: () => void;
  /**
   * Background image URL
   */
  backgroundImage?: string;
  /**
   * Background image alt text
   */
  backgroundImageAlt?: string;
  /**
   * Minimum height of the hero section
   * @default "90vh"
   */
  minHeight?: string;
  className?: string;
}

/* ─────────────────────────────────────────────
   HELPERS
   ───────────────────────────────────────────── */
function highlightWord(text: string, word: string): React.ReactNode {
  if (!word) return text;
  const parts = text.split(new RegExp(`(${word})`, "gi"));
  return parts.map((part, i) =>
    part.toLowerCase() === word.toLowerCase() ? (
      <TitleAccent key={i}>{part}</TitleAccent>
    ) : (
      part
    )
  );
}

/* ─────────────────────────────────────────────
   COMPONENT
   ───────────────────────────────────────────── */
export function Hero({
  eyebrow,
  heading,
  accentWord,
  description,
  primaryCta,
  onPrimaryCtaClick,
  secondaryCta,
  onSecondaryCtaClick,
  backgroundImage,
  backgroundImageAlt = "Hero background",
  minHeight = "90vh",
  className,
}: HeroProps) {
  const resolvedHeading =
    typeof heading === "string" && accentWord
      ? highlightWord(heading, accentWord)
      : heading;

  return (
    <section
      className={cn(
        "relative flex items-center justify-center overflow-hidden",
        className
      )}
      style={{ minHeight }}
    >
      {/* ── Background Image ── */}
      {backgroundImage && (
        <div className="absolute inset-0 z-0">
          <img
            src={backgroundImage}
            alt={backgroundImageAlt}
            className="w-full h-full object-cover"
          />
          {/* Dark gradient overlay */}
          <div className="absolute inset-0 hero-gradient" aria-hidden="true" />
        </div>
      )}

      {/* ── Content ── */}
      <div className="relative z-10 text-center px-6 max-w-4xl mx-auto">
        {/* Eyebrow */}
        {eyebrow && (
          <Eyebrow className="mb-4 tracking-[0.3em]">{eyebrow}</Eyebrow>
        )}

        {/* Heading */}
        <Title as="h1" size="hero" className="mb-6">
          {resolvedHeading}
        </Title>

        {/* Description */}
        {description && (
          <p className="text-base md:text-xl text-[--color-foreground-muted] mb-10 max-w-2xl mx-auto leading-relaxed">
            {description}
          </p>
        )}

        {/* CTAs */}
        {(primaryCta || secondaryCta) && (
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {primaryCta && (
              <Button
                variant="primary"
                size="xl"
                onClick={onPrimaryCtaClick}
              >
                {primaryCta}
              </Button>
            )}
            {secondaryCta && (
              <Button
                variant="outlined"
                size="xl"
                onClick={onSecondaryCtaClick}
              >
                {secondaryCta}
              </Button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
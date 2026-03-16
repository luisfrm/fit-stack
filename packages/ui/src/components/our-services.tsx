import * as React from "react";
import { cn } from "@workspace/ui/lib/utils";
import { SectionHeader, TitleAccent } from "@workspace/ui/components/title";
import { ServiceCard } from "@workspace/ui/components/service-card";

/* ─────────────────────────────────────────────
   TYPES
   ───────────────────────────────────────────── */
export interface ServiceItem {
  icon: string;
  title: string;
  description: string;
  /**
   * If true, this card gets the `featured` variant (glowing border)
   */
  featured?: boolean;
  /**
   * Optional CTA label on the card
   */
  cta?: string;
  onCtaClick?: () => void;
}

export interface OurServicesProps {
  eyebrow?: string;
  title?: React.ReactNode;
  description?: string;
  services: ServiceItem[];
  /**
   * Number of columns in the grid
   * @default 3
   */
  columns?: 2 | 3 | 4;
  className?: string;
}

/* ─────────────────────────────────────────────
   COLUMN MAP
   ───────────────────────────────────────────── */
const colClass: Record<number, string> = {
  2: "grid-cols-1 md:grid-cols-2",
  3: "grid-cols-1 md:grid-cols-3",
  4: "grid-cols-1 sm:grid-cols-2 xl:grid-cols-4",
};

/* ─────────────────────────────────────────────
   COMPONENT
   ───────────────────────────────────────────── */
export function OurServices({
  eyebrow = "Nuestros Servicios",
  title = (
    <>
      EXCELENCIA EN CADA <TitleAccent>ÁREA</TitleAccent>
    </>
  ),
  description = "Instalaciones diseñadas para atletas exigentes que buscan lo mejor en equipamiento y ambiente.",
  services,
  columns = 3,
  className,
}: OurServicesProps) {
  return (
    <section
      id="servicios"
      className={cn(
        "py-[--spacing-section] bg-[--color-background] px-6",
        className
      )}
    >
      <div className="section-container">
        {/* Header */}
        <SectionHeader
          eyebrow={eyebrow}
          title={title}
          description={description}
          align="left"
        />

        {/* Cards grid */}
        <div className={cn("grid gap-8", colClass[columns])}>
          {services.map((service, idx) => (
            <ServiceCard
              key={`${service.title}-${idx}`}
              icon={service.icon}
              title={service.title}
              description={service.description}
              variant={service.featured ? "featured" : "default"}
              cta={service.cta}
              onCtaClick={service.onCtaClick}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
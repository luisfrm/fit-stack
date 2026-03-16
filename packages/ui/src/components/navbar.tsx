"use client";

import * as React from "react";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";

/* ─────────────────────────────────────────────
   NAVBARITEM
   ───────────────────────────────────────────── */
export interface NavbarItemProps {
  href: string;
  children: React.ReactNode;
  active?: boolean;
  className?: string;
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
}

export function NavbarItem({
  href,
  children,
  active = false,
  className,
  onClick,
}: NavbarItemProps) {
  return (
    <a
      href={href}
      onClick={onClick}
      className={cn(
        // Base
        "relative text-sm font-medium uppercase tracking-wider",
        "transition-colors duration-200",
        // Inactive
        "text-white/80 hover:text-[--color-primary]",
        // Active state
        active && "text-[--color-primary]",
        // Underline indicator
        "after:absolute after:-bottom-1 after:left-0",
        "after:h-[2px] after:rounded-full after:bg-[--color-primary]",
        "after:transition-all after:duration-300",
        active ? "after:w-full" : "after:w-0 hover:after:w-full",
        className
      )}
    >
      {children}
    </a>
  );
}

/* ─────────────────────────────────────────────
   NAVBAR
   ───────────────────────────────────────────── */
export interface NavItem {
  label: string;
  href: string;
}

export interface NavbarProps {
  /**
   * Brand name — the part before the accent
   */
  brandName?: string;
  /**
   * Accent portion of brand name (rendered in primary color)
   */
  brandAccent?: string;
  /**
   * Material Symbol icon for the brand logo
   */
  brandIcon?: string;
  /**
   * Navigation links
   */
  items: NavItem[];
  /**
   * Label for the primary CTA button
   */
  ctaLabel?: string;
  onCtaClick?: () => void;
  /**
   * Currently active href — used to highlight the active NavbarItem
   */
  activeHref?: string;
  className?: string;
}

export function Navbar({
  brandName = "PREMIUM",
  brandAccent = "GYM",
  brandIcon = "fitness_center",
  items,
  ctaLabel = "Únete Ahora",
  onCtaClick,
  activeHref,
  className,
}: NavbarProps) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);

  // Shrink navbar on scroll
  React.useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  // Close mobile menu on resize
  React.useEffect(() => {
    const handler = () => {
      if (window.innerWidth >= 768) setMobileOpen(false);
    };
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  return (
    <header
      className={cn(
        "fixed top-0 w-full z-[--z-navbar]",
        "border-b border-[--color-border]",
        "transition-all duration-300",
        scrolled
          ? "bg-black/95 backdrop-blur-md h-16"
          : "bg-black/80 backdrop-blur-md h-20",
        className
      )}
    >
      <div className="section-container h-full flex items-center justify-between">
        {/* ── Brand ── */}
        <a
          href="/"
          className="flex items-center gap-2 group cursor-pointer shrink-0"
          aria-label={`${brandName}${brandAccent} — Home`}
        >
          {brandIcon && (
            <span
              className="material-symbols-outlined text-[--color-primary] text-3xl transition-transform duration-300 group-hover:rotate-12"
              aria-hidden="true"
            >
              {brandIcon}
            </span>
          )}
          <span className="text-xl font-black tracking-tighter italic">
            {brandName}
            <span className="text-[--color-primary]">{brandAccent}</span>
          </span>
        </a>

        {/* ── Desktop Nav ── */}
        <nav
          className="hidden md:flex items-center gap-8"
          aria-label="Primary navigation"
        >
          {items.map((item) => (
            <NavbarItem
              key={item.href}
              href={item.href}
              active={activeHref === item.href}
            >
              {item.label}
            </NavbarItem>
          ))}
        </nav>

        {/* ── Desktop CTA ── */}
        <div className="hidden md:flex items-center">
          <Button
            variant="primary"
            size="sm"
            onClick={onCtaClick}
          >
            {ctaLabel}
          </Button>
        </div>

        {/* ── Mobile Hamburger ── */}
        <button
          className={cn(
            "md:hidden flex flex-col justify-center gap-[5px] size-10 p-2",
            "text-white transition-all",
            "focus-visible:outline-2 focus-visible:outline-[--color-primary]"
          )}
          onClick={() => setMobileOpen((v) => !v)}
          aria-label="Toggle navigation menu"
          aria-expanded={mobileOpen}
        >
          <span
            className={cn(
              "block h-[2px] w-full bg-current rounded transition-all duration-300",
              mobileOpen && "translate-y-[7px] rotate-45"
            )}
          />
          <span
            className={cn(
              "block h-[2px] w-full bg-current rounded transition-all duration-300",
              mobileOpen && "opacity-0 scale-x-0"
            )}
          />
          <span
            className={cn(
              "block h-[2px] w-full bg-current rounded transition-all duration-300",
              mobileOpen && "-translate-y-[7px] -rotate-45"
            )}
          />
        </button>
      </div>

      {/* ── Mobile Menu ── */}
      <div
        className={cn(
          "md:hidden absolute top-full left-0 w-full",
          "bg-black/95 backdrop-blur-md border-b border-[--color-border]",
          "transition-all duration-300 overflow-hidden",
          mobileOpen ? "max-h-[400px] py-6" : "max-h-0"
        )}
        aria-hidden={!mobileOpen}
      >
        <nav
          className="section-container flex flex-col gap-4"
          aria-label="Mobile navigation"
        >
          {items.map((item) => (
            <NavbarItem
              key={item.href}
              href={item.href}
              active={activeHref === item.href}
              onClick={() => setMobileOpen(false)}
              className="py-2 text-base"
            >
              {item.label}
            </NavbarItem>
          ))}
          <div className="pt-4 border-t border-[--color-border]">
            <Button
              variant="primary"
              size="md"
              fullWidth
              onClick={() => {
                setMobileOpen(false);
                onCtaClick?.();
              }}
            >
              {ctaLabel}
            </Button>
          </div>
        </nav>
      </div>
    </header>
  );
}
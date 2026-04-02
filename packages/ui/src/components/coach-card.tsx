"use client"

import * as React from "react"
import { cn } from "@workspace/ui/lib/utils"
import { Button } from "./button"
import { NextImage } from "./next/image"
import { Text } from "./text"
import { Switch } from "./switch"
import { Pencil, UserPlus, Trash2 } from "lucide-react"

export interface CoachCardProps {
  readonly firstName: string;
  readonly lastName: string;
  readonly role?: string;
  readonly specialities?: string[] | null;
  readonly imageUrl?: string | null;
  readonly isVisible?: boolean;
  readonly onEdit?: () => void;
  readonly onDelete?: () => void;
  readonly onToggleVisibility?: (visible: boolean) => void;
  readonly className?: string;
}

export function CoachCard({
  firstName,
  lastName,
  role,
  specialities,
  imageUrl,
  isVisible = true,
  onEdit,
  onDelete,
  onToggleVisibility,
  className,
}: Readonly<CoachCardProps>) {
  return (
    <div className={cn(
      "bg-card rounded-xl overflow-hidden border group flex flex-col aspect-3/5 h-full",
      className
    )}>
      {/* ── Image Header ── */}
      <div className="flex-1 overflow-hidden bg-muted">
        {imageUrl ? (
          <NextImage
            src={imageUrl}
            alt={`${firstName} ${lastName}`}
            fill
            containerClassName="h-full w-full"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <div className="size-20 rounded-full bg-surface-2 flex items-center justify-center text-foreground-dim">
              <UserPlus className="size-10" />
            </div>
          </div>
        )}
      </div>

      {/* ── Content ── */}
      <div className="p-5 flex flex-col gap-4 flex-1">
        <div className="min-h-12">
          <Text as="p" size="lg" weight="bold" className="line-clamp-1">
            {firstName} {lastName}
          </Text>
          <Text as="p" size="xs" weight="semibold" variant="primary" uppercase className="tracking-wider opacity-80">
            {role || "Especialista"}
          </Text>
        </div>

        {/* ── Badges/Tags ── */}
        <div className="min-h-5 flex flex-wrap gap-1.5">
          {specialities && specialities.length > 0 ? (
            specialities.map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 bg-surface-2 text-foreground-muted text-[10px] rounded font-medium uppercase border border-border-muted"
              >
                {tag}
              </span>
            ))
          ) : (
            <Text size="xs" variant="muted" italic>Sin especialidades</Text>
          )}
        </div>

        {/* ── Footer Actions ── */}
        <div className="pt-4 mt-auto border-t border-border-muted flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Switch
              checked={isVisible}
              onCheckedChange={onToggleVisibility}
            />
            <Text size="xs" weight="bold" variant="muted" uppercase>
              {isVisible ? "Visible" : "Oculto"}
            </Text>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={onEdit}
              className="size-8 text-foreground-dim hover:text-primary transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onDelete}
              className="size-8 text-foreground-dim hover:text-destructive transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * AddCoachCard — Placeholder card for adding new profiles
 */
export function AddCoachCard({ onClick, className }: Readonly<{ onClick?: () => void; className?: string }>) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "bg-surface/20 rounded-xl overflow-hidden border-2 border-dashed border-input group flex flex-col items-center justify-center aspect-3/5 h-full hover:border-primary/50 hover:bg-primary/5 transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary min-h-[400px]",
        className
      )}
    >
      <div className="size-16 rounded-full bg-surface-2 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
        <UserPlus className="w-8 h-8 text-foreground-dim group-hover:text-primary transition-colors" />
      </div>
      <Text size="sm" weight="bold" uppercase className="tracking-widest text-foreground-muted group-hover:text-primary transition-colors text-center">
        Añadir<br />Profesional
      </Text>
    </button>
  )
}

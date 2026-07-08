"use client";

import * as React from "react";
import { Search, X, CircleX, Building2 } from "lucide-react";
import {
  Input,
  Button,
  Text,
  cn,
  Badge
} from "@workspace/ui/components";
import { type IPlatformOrganization } from "@workspace/shared/types";
import { COUNTRIES } from "@workspace/shared/constants";

interface OrganizationSelectorProps {
  readonly selectedOrganization: IPlatformOrganization | null;
  readonly searchTerm: string;
  readonly isSearching: boolean;
  readonly searchResults: IPlatformOrganization[];
  readonly onSearchChange: (value: string) => void;
  readonly onSelect: (org: IPlatformOrganization) => void;
  readonly onClear: () => void;
  readonly forced?: boolean;
}

export function OrganizationSelector({
  selectedOrganization,
  searchTerm,
  isSearching,
  searchResults,
  onSearchChange,
  onSelect,
  onClear,
  forced
}: OrganizationSelectorProps) {
  if (forced && selectedOrganization) {
    return (
      <SelectedOrganizationCard
        organization={selectedOrganization}
        onClear={forced ? undefined : onClear}
        forced
      />
    );
  }

  return (
    <div className="space-y-2 relative">
      <Text size="xs" weight="bold" className="uppercase tracking-widest text-slate-500">
        {selectedOrganization ? "Organización Seleccionada" : "Buscar Organización"}
      </Text>

      {selectedOrganization ? (
        <SelectedOrganizationCard
          organization={selectedOrganization}
          onClear={onClear}
        />
      ) : (
        <>
          <div className="relative">
            <Search className="absolute z-10 left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder="Buscar por nombre o slug..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-9"
              state={isSearching ? "loading" : "default"}
              autoComplete="off"
              rightElement={searchTerm && (
                <Button
                  type="button"
                  variant="ghost-danger"
                  size="xs"
                  rounded="full"
                  onClick={() => onSearchChange("")}
                  className="h-7 w-7 p-0"
                >
                  <CircleX size={16} />
                </Button>
              )}
            />
          </div>

          {searchTerm && !isSearching && (
            <div className="absolute z-50 w-full bg-popover border border-border rounded-xl overflow-hidden shadow-2xl mt-1 max-h-60 overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
              {searchResults.length === 0 ? (
                <div className="p-6 flex flex-col items-center justify-center text-center gap-3">
                  <div className="size-12 rounded-full bg-muted/30 flex items-center justify-center text-muted-foreground">
                    <Building2 size={24} className="opacity-20" />
                  </div>
                  <div className="space-y-1">
                    <Text weight="medium" size="base" className="opacity-80">Organización no encontrada</Text>
                    <Text size="sm" variant="muted">No hay resultados para "{searchTerm}"</Text>
                  </div>
                </div>
              ) : (
                searchResults.map(org => (
                  <button
                    key={org.id}
                    type="button"
                    onClick={() => onSelect(org)}
                    className="w-full text-left px-4 py-3 flex flex-col items-start gap-0.5 border-b border-border last:border-0 bg-transparent hover:bg-accent/10 active:bg-accent/20 transition-colors outline-none"
                  >
                    <Text weight="semibold" size="base" className="uppercase tracking-tight">
                      {org.name}
                    </Text>
                    <div className="flex items-center gap-2">
                      <Text size="xs" variant="muted">
                        {org.slug}.fit-stack.com
                      </Text>
                      {org.countryCode && (
                        <Badge size="sm" variant="default" className="text-[8px] uppercase">
                          {COUNTRIES[org.countryCode]?.name || org.countryCode}
                        </Badge>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SelectedOrganizationCard({
  organization,
  onClear,
  forced
}: {
  readonly organization: IPlatformOrganization;
  readonly onClear?: () => void;
  readonly forced?: boolean;
}) {
  const hasSub = organization.latestSubscription;
  const isActive = hasSub?.status === "active";

  return (
    <div className="flex flex-col gap-3">
      <div className="p-4 rounded-xl border border-border bg-muted/30 flex items-center justify-between animate-in fade-in slide-in-from-top-2 duration-300">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <Text weight="bold" size="base" className="uppercase tracking-tight leading-none">
              {organization.name}
            </Text>
            {organization.countryCode && (
              <Badge size="sm" className="text-[9px] uppercase font-bold">{organization.countryCode}</Badge>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <Text size="xs" variant="muted">
              {organization.slug}.fit-stack.com
            </Text>
          </div>
        </div>
        {!forced && onClear && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={onClear}
            className="hover:bg-destructive/10 hover:text-destructive rounded-lg h-9 w-9 transition-colors"
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      {hasSub && (
        <div className={cn(
          "px-4 py-3 rounded-xl border flex items-center justify-between animate-in zoom-in-95 duration-500",
          isActive ? "border-success/20 bg-success/5" : "border-destructive/20 bg-destructive/5"
        )}>
          <div className="flex flex-col gap-0.5">
            <Text size="xs" weight="bold" className={cn("uppercase tracking-widest", isActive ? "text-success" : "text-destructive")}>
              {isActive ? "Suscripción Vigente" : "Suscripción Inactiva"}
            </Text>
            <Text size="sm" weight="semibold">
              {hasSub.planName} • {isActive ? "Vence el" : "Venció el"} {new Date(hasSub.endDate).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })}
            </Text>
          </div>
          {isActive && (
            <div className="text-right flex flex-col items-end">
              <Text size="xs" variant="muted">Plan activo</Text>
              <Text size="xs" weight="bold" className="text-primary">Continuidad asegurada</Text>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

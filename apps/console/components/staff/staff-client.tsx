"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@workspace/ui/components";
import { StaffTable } from "@/components/staff/staff-table";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { cn } from "@workspace/ui/lib/utils";
import type { PlatformStaffMember } from "@/lib/services/staff-service";

interface StaffClientProps {
  readonly staff: PlatformStaffMember[];
  readonly initialQuery: string;
  readonly initialRole: string | null;
  readonly onSuccess?: () => void;
}

const ROLE_OPTIONS = [
  {
    id: "owner",
    label: "Propietarios",
    className: "text-amber-500 border-amber-500/20 bg-amber-500/5",
  },
  {
    id: "admin",
    label: "Administradores",
    className: "text-slate-300 border-white/20 bg-white/5",
  },
  {
    id: "support",
    label: "Soporte",
    className: "text-blue-500 border-blue-500/20 bg-blue-500/5",
  },
] as const;

export function StaffClient({
  staff,
  initialQuery,
  initialRole,
  onSuccess,
}: StaffClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchTerm, setSearchTerm] = React.useState(initialQuery);
  const debouncedSearch = useDebounce(searchTerm, 500);
  const [activeRole, setActiveRole] = React.useState<string | null>(
    initialRole,
  );

  React.useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    let changed = false;

    const currentSearch = params.get("search") || "";
    if (debouncedSearch !== currentSearch) {
      if (debouncedSearch) params.set("search", debouncedSearch);
      else params.delete("search");
      changed = true;
    }

    if (changed) {
      const query = params.toString();
      router.push(query ? `/staff?${query}` : "/staff");
    }
  }, [debouncedSearch, router, searchParams]);

  const setRoleFilter = (newRole: string | null) => {
    setActiveRole(newRole);
    const params = new URLSearchParams(searchParams.toString());
    if (newRole) params.set("role", newRole);
    else params.delete("role");
    const query = params.toString();
    router.push(query ? `/staff?${query}` : "/staff");
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative w-full sm:max-w-xs">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground-dim"
          />
          <input
            type="text"
            placeholder="Buscar por nombre o email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-10 pl-10 pr-4 w-full bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-foreground-dim focus:outline-none focus:border-primary/40 transition-colors"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {ROLE_OPTIONS.map((btn) => (
            <Button
              key={btn.id}
              size="sm"
              variant={activeRole === btn.id ? "primary" : "glass"}
              className={cn(
                "cursor-pointer font-medium transition-all normal-case tracking-normal",
                activeRole === btn.id ? "border-primary" : btn.className,
              )}
              onClick={() =>
                setRoleFilter(activeRole === btn.id ? null : btn.id)
              }
            >
              {btn.label}
            </Button>
          ))}
        </div>
      </div>

      <StaffTable
        key={`${activeRole ?? "all"}-${debouncedSearch}`}
        staff={staff}
        onSuccess={onSuccess}
      />
    </div>
  );
}

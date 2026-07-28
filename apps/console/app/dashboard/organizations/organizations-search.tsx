"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { useDebounce } from "@/lib/hooks/use-debounce";

interface OrganizationsSearchProps {
  readonly initialValue: string;
  readonly paramName?: string;
}

export function OrganizationsSearch({
  initialValue,
  paramName = "query",
}: OrganizationsSearchProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [value, setValue] = React.useState(initialValue);
  const debouncedValue = useDebounce(value, 500);

  React.useEffect(() => {
    const currentQuery = searchParams.get(paramName) || "";
    if (debouncedValue === currentQuery) return;

    const params = new URLSearchParams(searchParams.toString());
    if (debouncedValue) {
      params.set(paramName, debouncedValue);
    } else {
      params.delete(paramName);
    }
    params.set("page", "1");
    router.push(`/dashboard/organizations?${params.toString()}`);
  }, [debouncedValue, paramName, router, searchParams]);

  return (
    <div className="relative w-full max-w-md">
      <Search
        size={16}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground-dim"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Buscar por nombre o slug..."
        className="h-10 pl-10 pr-4 w-full bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-foreground-dim focus:outline-none focus:border-primary/40 transition-colors"
      />
    </div>
  );
}

"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button, Text } from "@workspace/ui/components";

interface OrganizationsPaginationProps {
  readonly page: number;
  readonly totalPages: number;
}

export function OrganizationsPagination({ page, totalPages }: OrganizationsPaginationProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const navigate = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", newPage.toString());
    router.push(`/dashboard/organizations?${params.toString()}`);
  };

  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-center gap-6 pt-4 border-t border-white/5">
      <Button
        variant="outlined"
        size="sm"
        leftIcon={<ChevronLeft size={16} />}
        disabled={page <= 1}
        onClick={() => navigate(Math.max(1, page - 1))}
        className="bg-transparent border-white/5"
      >
        ANTERIOR
      </Button>
      <Text size="xs" weight="bold" className="uppercase tracking-widest text-slate-500">
        Página <span className="text-white">{page}</span> de <span className="text-white">{totalPages}</span>
      </Text>
      <Button
        variant="outlined"
        size="sm"
        rightIcon={<ChevronRight size={16} />}
        disabled={page >= totalPages}
        onClick={() => navigate(Math.min(totalPages, page + 1))}
        className="bg-transparent border-white/5"
      >
        SIGUIENTE
      </Button>
    </div>
  );
}

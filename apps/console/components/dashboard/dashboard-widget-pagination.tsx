import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button, Text } from "@workspace/ui/components";

interface WidgetPaginationProps {
  readonly id: string;
  readonly page: number;
  readonly totalPages: number;
  readonly onPageChange: (page: number) => void;
}

/**
 * Paginación local de los widgets del dashboard. Siempre visible (aunque haya
 * una sola página) para mantener el layout estable entre cards.
 */
export function WidgetPagination({
  id,
  page,
  totalPages,
  onPageChange,
}: WidgetPaginationProps) {
  return (
    <div
      id={id}
      className="flex items-center justify-between gap-2 pt-4 border-t border-white/5"
    >
      <Button
        id={`${id}-prev`}
        variant="outlined"
        size="sm"
        disabled={page <= 1}
        onClick={() => onPageChange(Math.max(1, page - 1))}
        className="bg-transparent border-white/5 text-[10px] font-bold uppercase tracking-widest"
      >
        <ChevronLeft size={14} className="shrink-0" />
        Anterior
      </Button>
      <Text
        id={`${id}-label`}
        size="xs"
        weight="bold"
        className="uppercase tracking-widest text-slate-500"
      >
        Página <span className="text-white">{page}</span> de{" "}
        <span className="text-white">{totalPages}</span>
      </Text>
      <Button
        id={`${id}-next`}
        variant="outlined"
        size="sm"
        disabled={page >= totalPages}
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        className="bg-transparent border-white/5 text-[10px] font-bold uppercase tracking-widest"
      >
        Siguiente
        <ChevronRight size={14} className="shrink-0" />
      </Button>
    </div>
  );
}

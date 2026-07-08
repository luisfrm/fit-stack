import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"
import { Button } from "@workspace/ui/components"
import { ChevronLeftIcon, ChevronRightIcon, MoreHorizontalIcon } from "lucide-react"

function PaginationRoot({ className, ...props }: React.ComponentProps<"nav">) {
  return (
    <nav
      role="navigation"
      aria-label="pagination"
      data-slot="pagination"
      className={cn("mx-auto flex w-full justify-center", className)}
      {...props}
    />
  )
}

function PaginationContent({
  className,
  ...props
}: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="pagination-content"
      className={cn("flex flex-row items-center gap-2", className)}
      {...props}
    />
  )
}

function PaginationItem({ className, ...props }: React.ComponentProps<"li">) {
  return <li data-slot="pagination-item" className={cn("shrink-0", className)} {...props} />
}

type PaginationLinkProps = {
  isActive?: boolean
} & Pick<React.ComponentProps<typeof Button>, "size"> &
  React.ComponentProps<"a">

function PaginationLink({
  className,
  isActive,
  size = "sm",
  ...props
}: PaginationLinkProps) {
  return (
    <Button
      asChild
      variant={isActive ? "secondary" : "ghost"}
      size={size}
      className={cn(
        isActive && "bg-primary/20 hover:bg-primary/20 text-primary",
        !isActive && "hover:bg-accent",
        className
      )}
    >
      <a
        aria-current={isActive ? "page" : undefined}
        data-slot="pagination-link"
        data-active={isActive}
        {...props}
      />
    </Button>
  )
}

function PaginationPrevious({
  className,
  text = "Anterior",
  ...props
}: React.ComponentProps<typeof PaginationLink> & { text?: string }) {
  return (
    <PaginationLink
      aria-label="Ir a la página anterior"
      className={cn("px-4 gap-2", className)}
      {...props}
    >
      <ChevronLeftIcon className="size-4" />
      <span className="hidden sm:block">{text}</span>
    </PaginationLink>
  )
}

function PaginationNext({
  className,
  text = "Siguiente",
  ...props
}: React.ComponentProps<typeof PaginationLink> & { text?: string }) {
  return (
    <PaginationLink
      aria-label="Ir a la página siguiente"
      className={cn("px-4 gap-2", className)}
      {...props}
    >
      <span className="hidden sm:block">{text}</span>
      <ChevronRightIcon className="size-4" />
    </PaginationLink>
  )
}

function PaginationEllipsis({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      aria-hidden
      data-slot="pagination-ellipsis"
      className={cn(
        "flex h-10 w-10 items-center justify-center",
        className
      )}
      {...props}
    >
      <MoreHorizontalIcon className="size-4 text-foreground-dim" />
      <span className="sr-only">Más páginas</span>
    </span>
  )
}

// ==========================================
// HIGH LEVEL PAGINATION COMPONENT
// ==========================================

export interface PaginationProps {
  readonly page?: number;
  readonly totalPages?: number;
  readonly total?: number;
  readonly limit?: number;
  readonly onPageChange: (page: number) => void;
  readonly className?: string;
  readonly showInfo?: boolean;
}

/**
 * Unified Pagination Component following shadcn design.
 */
export function Pagination({
  page = 1,
  totalPages = 1,
  total,
  limit,
  onPageChange,
  className,
  showInfo = true,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const renderPageLinks = () => {
    const pages = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(
          <PaginationItem key={i}>
            <PaginationLink
              isActive={page === i}
              className="w-10 px-0"
              onClick={(e) => {
                e.preventDefault();
                onPageChange(i);
              }}
              href="#"
            >
              {i}
            </PaginationLink>
          </PaginationItem>
        );
      }
    } else {
      // Logic with ellipsis
      const startPage = Math.max(1, page - 1);
      const endPage = Math.min(totalPages, page + 1);

      // Always show first page
      pages.push(
        <PaginationItem key={1}>
          <PaginationLink
            isActive={page === 1}
            className="w-10 px-0"
            onClick={(e) => {
              e.preventDefault();
              onPageChange(1);
            }}
            href="#"
          >
            1
          </PaginationLink>
        </PaginationItem>
      );

      if (startPage > 2) {
        pages.push(<PaginationEllipsis key="ellipsis-start" />);
      }

      for (let i = Math.max(2, startPage); i <= Math.min(totalPages - 1, endPage); i++) {
        pages.push(
          <PaginationItem key={i}>
            <PaginationLink
              isActive={page === i}
              className="w-10 px-0"
              onClick={(e) => {
                e.preventDefault();
                onPageChange(i);
              }}
              href="#"
            >
              {i}
            </PaginationLink>
          </PaginationItem>
        );
      }

      if (endPage < totalPages - 1) {
        pages.push(<PaginationEllipsis key="ellipsis-end" />);
      }

      // Always show last page
      pages.push(
        <PaginationItem key={totalPages}>
          <PaginationLink
            isActive={page === totalPages}
            className="w-10 px-0"
            onClick={(e) => {
              e.preventDefault();
              onPageChange(totalPages);
            }}
            href="#"
          >
            {totalPages}
          </PaginationLink>
        </PaginationItem>
      );
    }

    return pages;
  };

  return (
    <div className={cn("flex flex-col items-center gap-4 w-full", className)}>
      <PaginationRoot className="mx-0 w-auto">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              onClick={(e) => {
                e.preventDefault();
                if (page > 1) onPageChange(page - 1);
              }}
              href="#"
              className={cn(page <= 1 && "pointer-events-none opacity-50")}
            />
          </PaginationItem>

          {renderPageLinks()}

          <PaginationItem>
            <PaginationNext
              onClick={(e) => {
                e.preventDefault();
                if (page < totalPages) onPageChange(page + 1);
              }}
              href="#"
              className={cn(page >= totalPages && "pointer-events-none opacity-50")}
            />
          </PaginationItem>
        </PaginationContent>
      </PaginationRoot>

      {showInfo && total !== undefined && (
        <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-[0.2em]">
          Mostrando {limit ? Math.min((page - 1) * limit + 1, total) : '---'} - {limit ? Math.min(page * limit, total) : '---'} de {total} registros
        </div>
      )}
    </div>
  );
}

export {
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
}

"use client"

import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"
import { Skeleton } from "@workspace/ui/components"
import { Pagination, type PaginationProps } from "./pagination"

function TablePrimitive({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div
      data-slot="table-container"
      className="relative w-full overflow-x-auto flex-1"
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

// ==========================================
// GENERIC TABLE COMPONENT (EXPORTED)
// ==========================================

/**
 * ⚠️ NOTA TÉCNICA (SonarQube S6478):
 * Para evitar problemas de rendimiento y pérdida de foco en los inputs dentro de las tablas,
 * NO definas el array 'columns' ni las funciones 'cell' dentro del cuerpo del componente padre.
 *
 * ✅ CORRECTO: Define las columnas fuera del componente o usa React.useMemo(() => [...], []).
 * ❌ INCORRECTO: Definir const columns = [...] directamente en el componente funcional.
 */

export interface ColumnDef<T> {
  id?: string
  header: React.ReactNode | string
  cell: (item: T) => React.ReactNode
  className?: string
  headerClassName?: string
}

export interface TableProps<T> {
  readonly data: T[]
  readonly columns: ColumnDef<T>[]
  readonly emptyState?: React.ReactNode
  readonly onRowClick?: (item: T) => void
  readonly rowKey?: (item: T) => string | number
  readonly loading?: boolean
  readonly className?: string
  readonly pagination?: PaginationProps
}

function Table<T>({ 
  data, 
  columns, 
  emptyState, 
  onRowClick, 
  rowKey, 
  loading, 
  className,
  pagination
}: TableProps<T>) {
  const tableId = React.useId();

  return (
    <div className={cn("bg-glass rounded-xl border border-border overflow-hidden flex flex-col", className)}>
      <TablePrimitive>
        <TableHeader className="bg-table-header">
          <TableRow className="border-border hover:bg-transparent">
            {columns.map((col, i) => {
              const colKey = col.id ?? (typeof col.header === "string" ? col.header : `col-${tableId}-${i}`);
              return (
                <TableHead
                  key={colKey}
                  className={cn(
                    "py-4 text-foreground-muted uppercase text-[10px] tracking-widest font-bold",
                    col.className,
                    col.headerClassName
                  )}
                >
                  {col.header}
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading && (
            Array.from({ length: 5 }).map((_, rowIndex) => (
              <TableRow key={`${tableId}-loading-row-${rowIndex}`} className="border-border hover:bg-transparent">
                {columns.map((col, colIndex) => {
                  const cellKey = col.id ?? (typeof col.header === "string" ? col.header : `loading-cell-${colIndex}`);
                  return (
                    <TableCell key={`${tableId}-${cellKey}`} className={cn("py-4", col.className)}>
                      <Skeleton className="h-4 w-4/5" />
                    </TableCell>
                  );
                })}
              </TableRow>
            ))
          )}
          {data.length === 0 && emptyState && !loading && (
            <TableRow className="border-border hover:bg-transparent">
              <TableCell colSpan={columns.length} className="py-12 text-center text-foreground-dim">
                {emptyState}
              </TableCell>
            </TableRow>
          )}

          {!loading && data.map((item, rowIndex) => {
            // Intenta usar la prop rowKey, sino busca un .id, sino usa string del índice con tableId.
            const itemKey = rowKey ? rowKey(item) : ((item as Record<string, unknown>).id as string | number | undefined ?? `${tableId}-row-${rowIndex}`);

            return (
              <TableRow
                key={itemKey}
                className={cn(
                  "group transition-colors border-border",
                  onRowClick ? "cursor-pointer hover:bg-foreground/3" : "hover:bg-foreground/3"
                )}
                onClick={() => onRowClick?.(item)}
              >
                {columns.map((col, colIndex) => {
                  const cellKey = col.id ?? (typeof col.header === "string" ? col.header : `cell-${colIndex}`);
                  return (
                    <TableCell
                      key={cellKey}
                      className={cn("py-4", col.className)}
                    >
                      {col.cell(item)}
                    </TableCell>
                  );
                })}
              </TableRow>
            );
          })}
        </TableBody>
      </TablePrimitive>

      {pagination && (
        <div className="p-4 border-t border-border bg-table-header">
          <Pagination {...pagination} />
        </div>
      )}
    </div>
  )
}

export { Table }

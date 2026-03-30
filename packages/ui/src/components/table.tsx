"use client"

import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

function TablePrimitive({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div
      data-slot="table-container"
      className="relative w-full overflow-x-auto"
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
        "h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0",
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

export interface ColumnDef<T> {
  id?: string
  header: React.ReactNode | string
  cell: (item: T) => React.ReactNode
  className?: string
  headerClassName?: string
}

export interface TableProps<T> {
  data: T[]
  columns: ColumnDef<T>[]
  emptyState?: React.ReactNode
  onRowClick?: (item: T) => void
  rowKey?: (item: T) => string | number
}

function Table<T>({ data, columns, emptyState, onRowClick, rowKey }: TableProps<T>) {
  return (
    <div className="bg-zinc-900/50 rounded-xl border border-white/5 overflow-hidden">
      <TablePrimitive>
        <TableHeader className="bg-black/20">
          <TableRow className="border-white/5 hover:bg-transparent">
            {columns.map((col, i) => {
              const colKey = col.id ?? (typeof col.header === "string" ? col.header : `col-${i}`);
              return (
                <TableHead 
                  key={colKey} 
                  className={cn(
                    "py-4 text-slate-400 uppercase text-[10px] tracking-widest font-bold", 
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
          {data.length === 0 && emptyState ? (
            <TableRow className="border-white/5 hover:bg-transparent">
              <TableCell colSpan={columns.length} className="py-12 text-center text-slate-500">
                {emptyState}
              </TableCell>
            </TableRow>
          ) : (
            data.map((item, rowIndex) => {
              // Intenta usar la prop rowKey, sino busca un .id, sino usa string del índice.
              const itemKey = rowKey ? rowKey(item) : ((item as Record<string, unknown>).id as string | number | undefined ?? `row-${rowIndex}`);
              
              return (
                <TableRow 
                  key={itemKey} 
                  className={cn(
                    "group transition-colors border-white/5",
                    onRowClick ? "cursor-pointer hover:bg-white/5" : "hover:bg-white/5"
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
            })
          )}
        </TableBody>
      </TablePrimitive>
    </div>
  )
}

export { Table }

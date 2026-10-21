import * as React from "react";

import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export interface DataTableColumn<T> {
  id: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  className?: string;
  headerClassName?: string;
}

export interface DataTableProps<T> extends React.ComponentProps<"div"> {
  columns: DataTableColumn<T>[];
  data: T[];
  loading?: boolean;
  skeletonRows?: number;
  emptyMessage?: string;
  getRowKey?: (row: T, index: number) => string | number;
  onRowClick?: (row: T) => void;
}

function DataTable<T>({
  className,
  columns,
  data,
  loading = false,
  skeletonRows = 5,
  emptyMessage = "No data available",
  getRowKey,
  onRowClick,
  ...props
}: DataTableProps<T>) {
  return (
    <div
      data-slot="data-table"
      className={cn(
        "w-full overflow-hidden rounded-xl border border-border bg-card",
        className
      )}
      {...props}
    >
      <div className="overflow-x-auto">
        <table className="w-full caption-bottom text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              {columns.map((column) => (
                <th
                  key={column.id}
                  className={cn(
                    "h-11 px-4 text-left align-middle text-xs font-medium tracking-wide text-muted-foreground uppercase",
                    column.headerClassName
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: skeletonRows }).map((_, rowIndex) => (
                <tr
                  key={`skeleton-${rowIndex}`}
                  className="border-b border-border last:border-0"
                >
                  {columns.map((column) => (
                    <td key={column.id} className="px-4 py-3 align-middle">
                      <Skeleton className="h-4 w-full max-w-[12rem]" />
                    </td>
                  ))}
                </tr>
              ))
            ) : data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-12 text-center text-muted-foreground"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((row, rowIndex) => (
                <tr
                  key={getRowKey ? getRowKey(row, rowIndex) : rowIndex}
                  className={cn(
                    "border-b border-border transition-colors last:border-0 hover:bg-muted/30",
                    onRowClick && "cursor-pointer"
                  )}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map((column) => (
                    <td
                      key={column.id}
                      className={cn(
                        "px-4 py-3 align-middle text-foreground",
                        column.className
                      )}
                    >
                      {column.cell(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export { DataTable };

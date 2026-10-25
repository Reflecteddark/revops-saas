/**
 * apps/web/src/components/DataTable.tsx
 *
 * Generic typed DataTable using TanStack Table and shadcn/ui Table primitives.
 * Features:
 * - .surface wrapper with subtle borders
 * - 44px rows with smooth hover state
 * - Column sorting icons revealed on hover and active sort
 * - Client-side pagination, skeleton loading, and empty states
 */

import * as React from 'react';
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { ChevronDown, ChevronsUpDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

export interface DataTableProps<TData> {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  loading?: boolean;
  emptyMessage?: string; // default: 'Нет данных'
  onRowClick?: (row: TData) => void;
  pageSize?: number; // default 20
  enableSorting?: boolean; // default true
  className?: string;
}

export function DataTable<TData>({
  columns,
  data,
  loading = false,
  emptyMessage = 'Нет данных',
  onRowClick,
  pageSize = 20,
  enableSorting = true,
  className,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [pagination, setPagination] = React.useState({
    pageIndex: 0,
    pageSize,
  });

  // Sync pageSize prop if it changes
  React.useEffect(() => {
    setPagination((prev) => ({ ...prev, pageSize }));
  }, [pageSize]);

  const table = useReactTable<TData>({
    data,
    columns,
    state: {
      sorting: enableSorting ? sorting : [],
      pagination,
    },
    onSortingChange: enableSorting ? setSorting : undefined,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: enableSorting ? getSortedRowModel() : undefined,
    getPaginationRowModel: getPaginationRowModel(),
    enableSorting,
    getRowId: (row: unknown, index: number) => {
      if (
        row &&
        typeof row === 'object' &&
        'id' in row &&
        row.id !== undefined &&
        row.id !== null
      ) {
        return String(row.id);
      }
      return String(index);
    },
  });

  const showPagination = !loading && data.length > pageSize;

  return (
    <div className={cn('w-full space-y-4', className)}>
      <div className="surface overflow-hidden">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="border-b border-subtle">
                {headerGroup.headers.map((header) => {
                  const canSort = enableSorting && header.column.getCanSort();
                  const isSorted = header.column.getIsSorted();

                  return (
                    <TableHead
                      key={header.id}
                      className={cn(
                        'group h-9 px-4 text-left align-middle text-[11px] font-medium uppercase tracking-[0.06em] text-tertiary select-none',
                        canSort && 'cursor-pointer'
                      )}
                      onClick={
                        canSort
                          ? header.column.getToggleSortingHandler()
                          : undefined
                      }
                    >
                      <div className="flex items-center space-x-1.5">
                        <span>
                          {header.isPlaceholder
                            ? null
                            : flexRender(
                                header.column.columnDef.header,
                                header.getContext()
                              )}
                        </span>
                        {canSort && (
                          <span
                            className={cn(
                              'inline-flex shrink-0 transition-opacity duration-150',
                              isSorted
                                ? 'opacity-100 text-secondary'
                                : 'opacity-0 group-hover:opacity-100 text-tertiary'
                            )}
                          >
                            {isSorted === 'asc' ? (
                              <ChevronUp
                                className="h-3.5 w-3.5"
                                data-testid="sort-asc"
                              />
                            ) : isSorted === 'desc' ? (
                              <ChevronDown
                                className="h-3.5 w-3.5"
                                data-testid="sort-desc"
                              />
                            ) : (
                              <ChevronsUpDown
                                className="h-3.5 w-3.5"
                                data-testid="sort-none"
                              />
                            )}
                          </span>
                        )}
                      </div>
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading ? (
              // 5 skeleton rows
              Array.from({ length: 5 }).map((_, rowIndex) => (
                <TableRow
                  key={`skeleton-row-${rowIndex}`}
                  data-testid="skeleton-row"
                  className="h-11 border-b border-subtle"
                >
                  {columns.map((_, colIndex) => (
                    <TableCell key={`skeleton-cell-${rowIndex}-${colIndex}`} className="px-4 py-3">
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                  onClick={() => onRowClick?.(row.original)}
                  className={cn(
                    'h-11 border-b border-subtle transition-colors duration-150',
                    onRowClick &&
                      'cursor-pointer hover:bg-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent/50'
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="px-4 py-3">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="text-tertiary h-24 text-center text-xs"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {showPagination && (
        <div className="flex items-center justify-between px-2 py-2">
          <div className="text-secondary text-xs">
            Страница {table.getState().pagination.pageIndex + 1} из{' '}
            {Math.max(1, table.getPageCount())}
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              Назад
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Вперёд
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default DataTable;

import { Fragment, useState, type ReactNode } from "react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";

/** Column meta we read for layout (right-align numerics). */
type ColMeta = { align?: "right" };

type SortableTableProps<T> = {
  data: T[];
  /** Headless column model — drives the header row + sorting only. The actual
   *  row markup comes from `renderRow`, so every bespoke cell/style is kept. */
  columns: ColumnDef<T>[];
  /** Render the (sorted) row's markup — may return multiple <tr> (e.g. an
   *  expand row). Must produce the same number/order of <td> as columns. */
  renderRow: (row: T, index: number) => ReactNode;
  getRowId?: (row: T, index: number) => string;
  initialSorting?: SortingState;
  /** Extra rows appended after the body (e.g. a cash total row). */
  footer?: ReactNode;
  /** Extra class on the <table> (e.g. "holdings"). */
  className?: string;
  /** Min table width — below this the wrapper scrolls horizontally. */
  minWidth?: number;
};

/**
 * Thin TanStack-Table wrapper. Headless: it owns sort state + sorted order and
 * renders the (sortable) header row; the caller still renders its own row
 * markup via `renderRow`, so the table looks identical to the hand-built one —
 * just sortable, and horizontally scrollable on narrow screens.
 */
export function SortableTable<T>({
  data,
  columns,
  renderRow,
  getRowId,
  initialSorting,
  footer,
  className,
  minWidth,
}: SortableTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>(initialSorting ?? []);
  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId,
  });

  return (
    <div className="tableScroll">
      <table
        className={`table${className ? ` ${className}` : ""}`}
        style={minWidth ? { minWidth } : undefined}
      >
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((header) => {
                const meta = header.column.columnDef.meta as ColMeta | undefined;
                const sortable = header.column.getCanSort();
                const sorted = header.column.getIsSorted();
                return (
                  <th
                    key={header.id}
                    data-col={header.column.id}
                    className={meta?.align === "right" ? "num" : undefined}
                    style={sortable ? { cursor: "pointer", userSelect: "none" } : undefined}
                    onClick={sortable ? header.column.getToggleSortingHandler() : undefined}
                    aria-sort={
                      sorted === "asc"
                        ? "ascending"
                        : sorted === "desc"
                          ? "descending"
                          : undefined
                    }
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {sortable && (
                      <span className="dataTable__sort">
                        {sorted === "asc" ? "↑" : sorted === "desc" ? "↓" : ""}
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row, i) => (
            <Fragment key={row.id}>{renderRow(row.original, i)}</Fragment>
          ))}
          {footer}
        </tbody>
      </table>
    </div>
  );
}

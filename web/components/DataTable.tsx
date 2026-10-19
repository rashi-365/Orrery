"use client";

import { useMemo, useState, type ReactNode } from "react";
import { cx } from "@/lib/format";

export type SortDirection = "asc" | "desc";

export type Column<Row> = {
  readonly id: string;
  readonly label: string;
  readonly align?: "left" | "right";
  readonly mono?: boolean;
  readonly sortValue: (row: Row) => string | number;
  readonly cell: (row: Row) => ReactNode;
};

type SortState = {
  readonly id: string;
  readonly direction: SortDirection;
};

type DataTableProps<Row> = {
  readonly columns: readonly Column<Row>[];
  readonly rows: readonly Row[];
  readonly rowKey: (row: Row) => string;
  readonly initialSort: SortState;
  readonly emptyMessage: string;
};

function SortArrow({ direction }: { readonly direction: SortDirection }) {
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true" className="text-accent">
      <path d={direction === "asc" ? "M4 1 L7 6 L1 6 Z" : "M4 7 L7 2 L1 2 Z"} fill="currentColor" />
    </svg>
  );
}

/** Dense sortable table. Click a header to sort; click again to reverse. */
export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  initialSort,
  emptyMessage,
}: DataTableProps<Row>) {
  const [sort, setSort] = useState<SortState>(initialSort);

  const sorted = useMemo(() => {
    const column = columns.find((c) => c.id === sort.id);
    if (column === undefined) return [...rows];
    const factor = sort.direction === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const left = column.sortValue(a);
      const right = column.sortValue(b);
      if (typeof left === "number" && typeof right === "number") return (left - right) * factor;
      return String(left).localeCompare(String(right)) * factor;
    });
  }, [columns, rows, sort]);

  function toggle(id: string) {
    setSort((previous) =>
      previous.id === id
        ? { id, direction: previous.direction === "asc" ? "desc" : "asc" }
        : { id, direction: "asc" },
    );
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-data">
          <thead>
            <tr>
              {columns.map((column) => {
                const active = sort.id === column.id;
                const ariaSort = active
                  ? sort.direction === "asc"
                    ? "ascending"
                    : "descending"
                  : "none";
                return (
                  <th
                    key={column.id}
                    scope="col"
                    aria-sort={ariaSort}
                    className={cx("px-4 py-2 font-normal", column.align === "right" && "text-right")}
                  >
                    <button
                      type="button"
                      onClick={() => toggle(column.id)}
                      className={cx(
                        "inline-flex items-center gap-1 font-mono text-label uppercase",
                        active ? "text-text" : "text-muted hover:text-text",
                      )}
                    >
                      {column.label}
                      {active && <SortArrow direction={sort.direction} />}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr className="border-t border-line">
                <td
                  colSpan={columns.length}
                  className="px-4 py-6 text-center font-mono text-label uppercase text-muted"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              sorted.map((row) => (
                <tr key={rowKey(row)} className="border-t border-line hover:bg-bg">
                  {columns.map((column) => (
                    <td
                      key={column.id}
                      className={cx(
                        "px-4 py-2",
                        column.mono && "font-mono",
                        column.align === "right" && "text-right",
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
      <div className="border-t border-line px-4 py-2 font-mono text-label uppercase text-muted">
        {`${rows.length} ROWS`}
      </div>
    </div>
  );
}

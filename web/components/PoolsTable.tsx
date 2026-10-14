"use client";

import { useMemo } from "react";
import { shortAddress } from "@/lib/format";
import { getMarket, type PoolRow } from "@/lib/market";
import { matchesQuery } from "@/lib/search";
import { DataTable, type Column } from "./DataTable";

function address(value: string) {
  return (
    <span className="text-muted" title={value}>
      {shortAddress(value)}
    </span>
  );
}

const COLUMNS: readonly Column<PoolRow>[] = [
  {
    id: "pair",
    label: "Pair",
    sortValue: (row) => row.label,
    cell: (row) => (
      <span className="font-sans font-semibold uppercase tracking-label text-text">{row.label}</span>
    ),
  },
  {
    id: "pool",
    label: "Pool address",
    mono: true,
    sortValue: (row) => row.address,
    cell: (row) => address(row.address),
  },
  {
    id: "token0",
    label: "Token 0",
    mono: true,
    sortValue: (row) => row.token0,
    cell: (row) => address(row.token0),
  },
  {
    id: "token1",
    label: "Token 1",
    mono: true,
    sortValue: (row) => row.token1,
    cell: (row) => address(row.token1),
  },
];

export function PoolsTable({ query }: { readonly query: string }) {
  const rows = useMemo(() => {
    const { pools } = getMarket();
    return pools.filter((pool) =>
      matchesQuery(`${pool.label} ${pool.address} ${pool.token0} ${pool.token1}`, query),
    );
  }, [query]);

  return (
    <DataTable
      columns={COLUMNS}
      rows={rows}
      rowKey={(row) => row.address}
      initialSort={{ id: "pair", direction: "asc" }}
      emptyMessage="NO POOLS MATCH THE SEARCH"
    />
  );
}

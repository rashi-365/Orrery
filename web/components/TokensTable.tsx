"use client";

import { useMemo } from "react";
import type { Address } from "viem";
import { shortAddress } from "@/lib/format";
import { getMarket } from "@/lib/market";
import { matchesQuery } from "@/lib/search";
import { DataTable, type Column } from "./DataTable";

type TokenRow = {
  readonly symbol: string;
  readonly name: string;
  readonly decimals: number;
  readonly address: Address;
  readonly poolCount: number;
};

const COLUMNS: readonly Column<TokenRow>[] = [
  {
    id: "symbol",
    label: "Symbol",
    sortValue: (row) => row.symbol,
    cell: (row) => (
      <span className="font-sans font-semibold uppercase tracking-label text-text">{row.symbol}</span>
    ),
  },
  {
    id: "name",
    label: "Name",
    sortValue: (row) => row.name,
    cell: (row) => <span className="text-muted">{row.name}</span>,
  },
  {
    id: "decimals",
    label: "Decimals",
    align: "right",
    mono: true,
    sortValue: (row) => row.decimals,
    cell: (row) => row.decimals,
  },
  {
    id: "pools",
    label: "Pools",
    align: "right",
    mono: true,
    sortValue: (row) => row.poolCount,
    cell: (row) => row.poolCount,
  },
  {
    id: "address",
    label: "Address",
    mono: true,
    sortValue: (row) => row.address,
    cell: (row) => (
      <span className="text-muted" title={row.address}>
        {shortAddress(row.address)}
      </span>
    ),
  },
];

export function TokensTable({ query }: { readonly query: string }) {
  const rows = useMemo(() => {
    const { tokens, pools } = getMarket();
    return tokens
      .map((token): TokenRow => ({
        symbol: token.symbol,
        name: token.name,
        decimals: token.decimals,
        address: token.address,
        poolCount: pools.filter((p) => p.token0 === token.address || p.token1 === token.address)
          .length,
      }))
      .filter((row) => matchesQuery(`${row.symbol} ${row.name} ${row.address}`, query));
  }, [query]);

  return (
    <DataTable
      columns={COLUMNS}
      rows={rows}
      rowKey={(row) => row.address}
      initialSort={{ id: "symbol", direction: "asc" }}
      emptyMessage="NO TOKENS MATCH THE SEARCH"
    />
  );
}

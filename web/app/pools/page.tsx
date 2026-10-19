import Link from "next/link";
import { Panel } from "@/components/Panel";
import { PoolsTable } from "@/components/PoolsTable";

export default function PoolsPage({
  searchParams,
}: {
  searchParams: { q?: string | string[] };
}) {
  const query = typeof searchParams.q === "string" ? searchParams.q : "";

  return (
    <div className="mx-auto max-w-7xl">
      <Panel
        index="04"
        title="Pools"
        flush
        action={
          query !== "" ? (
            <Link href="/pools" className="font-mono text-label uppercase text-accent">
              {`CLEAR "${query}"`}
            </Link>
          ) : undefined
        }
      >
        <PoolsTable query={query} />
      </Panel>
    </div>
  );
}

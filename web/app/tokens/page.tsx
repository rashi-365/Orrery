import Link from "next/link";
import { Panel } from "@/components/Panel";
import { TokensTable } from "@/components/TokensTable";

export default function TokensPage({
  searchParams,
}: {
  searchParams: { q?: string | string[] };
}) {
  const query = typeof searchParams.q === "string" ? searchParams.q : "";

  return (
    <div className="mx-auto max-w-7xl">
      <Panel
        index="03"
        title="Tokens"
        flush
        action={
          query !== "" ? (
            <Link href="/tokens" className="font-mono text-label uppercase text-accent">
              {`CLEAR "${query}"`}
            </Link>
          ) : undefined
        }
      >
        <TokensTable query={query} />
      </Panel>
    </div>
  );
}

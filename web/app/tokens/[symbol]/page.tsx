import Link from "next/link";
import { notFound } from "next/navigation";
import { Panel } from "@/components/Panel";
import { PriceChart } from "@/components/PriceChart";
import { TokenDetails, TradePanel } from "@/components/TokenDetails";
import { getMarket } from "@/lib/market";

export default function TokenPage({ params }: { params: { symbol: string } }) {
  const symbol = decodeURIComponent(params.symbol).toUpperCase();
  const token = getMarket().tokens.find((t) => t.symbol === symbol);
  if (token === undefined) notFound();

  return (
    <div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Panel
        title={`${token.symbol} / USD`}
        action={
          <Link href="/tokens" className="font-mono text-label uppercase text-accent">
            Back to tokens
          </Link>
        }
      >
        <PriceChart symbol={token.symbol} />
      </Panel>
      <div className="space-y-4">
        <TradePanel symbol={token.symbol} />
        <TokenDetails symbol={token.symbol} />
      </div>
    </div>
  );
}

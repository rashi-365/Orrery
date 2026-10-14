import type { Hex } from "viem";

type ReceiptWaiter = {
  waitForTransactionReceipt: (args: {
    hash: Hex;
    pollingInterval?: number;
  }) => Promise<{ status: string }>;
};

/** Waits for a transaction and throws if it was mined but reverted. */
export async function waitForSuccess(client: ReceiptWaiter, hash: Hex): Promise<void> {
  const receipt = await client.waitForTransactionReceipt({ hash, pollingInterval: 1000 });
  if (receipt.status !== "success") throw new Error("The transaction was mined but reverted.");
}

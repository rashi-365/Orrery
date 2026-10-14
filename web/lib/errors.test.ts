import assert from "node:assert/strict";
import { test } from "node:test";
import { BaseError } from "viem";
import { WrongNetworkError, assertWalletChain, describeError, revertMessage } from "./errors";

test("revertMessage knows contract errors and ignores unknown or inherited names", () => {
  assert.match(revertMessage("InsufficientOutputAmount") ?? "", /slippage/);
  assert.match(revertMessage("Expired") ?? "", /deadline/);
  assert.equal(revertMessage("NotARealError"), undefined);
  assert.equal(revertMessage("toString"), undefined);
  assert.equal(revertMessage(undefined), undefined);
});

test("describeError keeps only the first line of a plain error", () => {
  assert.equal(describeError(new Error("first line\nsecond line")), "first line");
  assert.equal(describeError("not an error"), "Something went wrong.");
});

test("describeError explains a wrong network", () => {
  assert.match(describeError(new WrongNetworkError(31337, 1)), /chain 1.*31337/);
});

test("describeError uses the short message of a viem error", () => {
  assert.equal(describeError(new BaseError("Short message")), "Short message");
});

test("assertWalletChain passes on the expected chain and throws otherwise", async () => {
  await assertWalletChain({ getChainId: async () => 31337 }, 31337);
  await assert.rejects(
    assertWalletChain({ getChainId: async () => 1 }, 31337),
    WrongNetworkError,
  );
});

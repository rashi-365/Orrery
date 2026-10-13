import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertLocalChain,
  loadDeployment,
  parseDeployment,
  parseOptions,
  parsePrivateKey,
  parsePrivateKeys,
  requireLocalRpc,
} from "./config.ts";

const KEY_A = `0x${"ab".repeat(32)}`;
const KEY_B = `0x${"cd".repeat(32)}`;
const TOKEN_A = `0x${"1".repeat(40)}`;
const TOKEN_B = `0x${"2".repeat(40)}`;

function sampleDeployment() {
  return {
    chainId: 31337,
    deployBlock: 0,
    deployer: `0x${"d".repeat(40)}`,
    factory: `0x${"a".repeat(40)}`,
    router: `0x${"b".repeat(40)}`,
    tokens: [
      { symbol: "AAA", name: "A", decimals: 6, address: TOKEN_A },
      { symbol: "BBB", name: "B", decimals: 18, address: TOKEN_B },
    ],
    pairs: [{ address: `0x${"c".repeat(40)}`, token0: TOKEN_A, token1: TOKEN_B }],
  };
}

test("parsePrivateKey accepts a 32-byte hex key", () => {
  assert.equal(parsePrivateKey(`  ${KEY_A}  `, "TEST_KEY"), KEY_A);
});

test("parsePrivateKey rejects malformed keys without echoing them", () => {
  const secret = "not-a-key-with-secret-material";
  assert.throws(
    () => parsePrivateKey(secret, "TEST_KEY"),
    (error: unknown) =>
      error instanceof Error && error.message.includes("TEST_KEY") && !error.message.includes(secret),
  );
  assert.throws(() => parsePrivateKey("0x1234", "TEST_KEY"), /TEST_KEY/);
  assert.throws(() => parsePrivateKey(`0x${"zz".repeat(32)}`, "TEST_KEY"), /TEST_KEY/);
  assert.throws(() => parsePrivateKey("ab".repeat(32), "TEST_KEY"), /TEST_KEY/);
});

test("parsePrivateKeys splits and trims a comma list", () => {
  assert.deepEqual(parsePrivateKeys(` ${KEY_A} , ${KEY_B},`, "KEYS"), [KEY_A, KEY_B]);
});

test("parsePrivateKeys rejects duplicates and empty lists", () => {
  assert.throws(() => parsePrivateKeys(`${KEY_A},${KEY_A.toUpperCase().replace("0X", "0x")}`, "KEYS"), /duplicate/);
  assert.throws(() => parsePrivateKeys(" , ", "KEYS"), /no keys/);
});

test("requireLocalRpc accepts local hosts only", () => {
  assert.doesNotThrow(() => requireLocalRpc("http://127.0.0.1:8545"));
  assert.doesNotThrow(() => requireLocalRpc("http://localhost:8545"));
  assert.throws(() => requireLocalRpc("https://rpc.sepolia.example.com"), /local node/);
  assert.throws(() => requireLocalRpc("not a url"), /valid URL/);
});

test("assertLocalChain accepts Anvil only", () => {
  assert.doesNotThrow(() => assertLocalChain(31337));
  assert.throws(() => assertLocalChain(11155111), /31337/);
  assert.throws(() => assertLocalChain(1), /31337/);
});

test("parseDeployment accepts valid input", () => {
  const parsed = parseDeployment(sampleDeployment());
  assert.equal(parsed.chainId, 31337);
  assert.equal(parsed.tokens.length, 2);
  assert.equal(parsed.pairs.length, 1);
});

test("parseDeployment rejects a pair that uses an unknown token", () => {
  const bad = sampleDeployment();
  bad.pairs = [{ address: `0x${"c".repeat(40)}`, token0: TOKEN_A, token1: `0x${"9".repeat(40)}` }];
  assert.throws(() => parseDeployment(bad), /unknown token/);
});

test("parseDeployment rejects an invalid router address", () => {
  const bad = { ...sampleDeployment(), router: "0x123" };
  assert.throws(() => parseDeployment(bad), /router/);
});

test("parseOptions applies defaults and reads flags", () => {
  assert.deepEqual(parseOptions([], 7), { maxSwaps: undefined, seed: 7 });
  assert.deepEqual(parseOptions(["--max-swaps", "5", "--seed", "0"], 7), { maxSwaps: 5, seed: 0 });
});

test("parseOptions rejects bad input", () => {
  assert.throws(() => parseOptions(["--max-swaps"], 1), /whole number/);
  assert.throws(() => parseOptions(["--max-swaps", "0"], 1), /at least 1/);
  assert.throws(() => parseOptions(["--max-swaps", "abc"], 1), /whole number/);
  assert.throws(() => parseOptions(["--bogus"], 1), /Unknown argument/);
});

test("the committed local deployment has 16 tokens in 5, 4 and 7 decimal groups and 25 pairs", () => {
  const deployment = loadDeployment();
  assert.equal(deployment.chainId, 31337);
  assert.equal(deployment.tokens.length, 16);
  assert.equal(deployment.pairs.length, 25);
  const count = (decimals: number) => deployment.tokens.filter((t) => t.decimals === decimals).length;
  assert.equal(count(6), 5);
  assert.equal(count(8), 4);
  assert.equal(count(18), 7);
});

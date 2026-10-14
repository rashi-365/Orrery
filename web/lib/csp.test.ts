import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCsp } from "./csp";

const RPC = ["http://127.0.0.1:8545", "http://localhost:8545"];

function directive(csp: string, name: string): string {
  const match = new RegExp(`(?:^|; )${name} ([^;]*)`).exec(csp);
  return match?.[1] ?? "";
}

test("scripts need the per-request nonce and may not be inline", () => {
  const csp = buildCsp({ nonce: "abc123", isDev: false, rpcOrigins: RPC });
  const scripts = directive(csp, "script-src");
  assert.ok(scripts.includes("'nonce-abc123'"));
  assert.ok(scripts.includes("'strict-dynamic'"));
  assert.ok(!scripts.includes("'unsafe-inline'"));
});

test("unsafe-eval is allowed only in development", () => {
  const prod = buildCsp({ nonce: "n", isDev: false, rpcOrigins: RPC });
  const dev = buildCsp({ nonce: "n", isDev: true, rpcOrigins: RPC });
  assert.ok(!prod.includes("'unsafe-eval'"));
  assert.ok(dev.includes("'unsafe-eval'"));
});

test("framing, plugins and base-URI tricks are shut off", () => {
  const csp = buildCsp({ nonce: "n", isDev: false, rpcOrigins: RPC });
  assert.equal(directive(csp, "frame-ancestors"), "'none'");
  assert.equal(directive(csp, "object-src"), "'none'");
  assert.equal(directive(csp, "base-uri"), "'self'");
  assert.equal(directive(csp, "form-action"), "'self'");
  assert.equal(directive(csp, "default-src"), "'self'");
});

test("the chain RPC origins can be reached and nothing else is allowed by default", () => {
  const csp = buildCsp({ nonce: "n", isDev: false, rpcOrigins: RPC });
  const connect = directive(csp, "connect-src");
  assert.ok(connect.includes("http://127.0.0.1:8545"));
  assert.ok(connect.includes("http://localhost:8545"));
  assert.ok(connect.startsWith("'self'"));
  assert.ok(!connect.includes("*.example"));
});

test("development adds websockets for hot reload and production does not", () => {
  const prod = buildCsp({ nonce: "n", isDev: false, rpcOrigins: RPC });
  const dev = buildCsp({ nonce: "n", isDev: true, rpcOrigins: RPC });
  assert.ok(!directive(prod, "connect-src").includes("ws://localhost"));
  assert.ok(directive(dev, "connect-src").includes("ws://localhost:*"));
});

import { NextResponse, type NextRequest } from "next/server";
import { LOCAL_RPC_URL } from "@/config/rpc";
import { buildCsp } from "@/lib/csp";

function rpcOrigins(): string[] {
  const origins = ["http://127.0.0.1:8545", "http://localhost:8545"];
  try {
    const configured = new URL(LOCAL_RPC_URL).origin;
    if (!origins.includes(configured)) origins.push(configured);
  } catch {
    // An unparseable RPC URL is not added to the policy, so requests to it stay blocked.
  }
  return origins;
}

export function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp({
    nonce,
    isDev: process.env.NODE_ENV !== "production",
    rpcOrigins: rpcOrigins(),
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|icon.svg).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};

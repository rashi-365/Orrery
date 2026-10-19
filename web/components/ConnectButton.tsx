"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { DEFAULT_CHAIN_ID } from "@/config/app";
import { describeError } from "@/lib/errors";
import { shortAddress } from "@/lib/format";

const BUTTON =
  "border border-line-strong px-3 py-2 font-mono text-label uppercase text-text transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:text-muted";

export function ConnectButton() {
  const { address, isConnected, chainId } = useAccount();
  const { connectors, connect, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: switching } = useSwitchChain();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (isConnected && address !== undefined) {
    const wrongNetwork = chainId !== DEFAULT_CHAIN_ID;
    return (
      <div className="flex items-center gap-2">
        {wrongNetwork && (
          <button
            type="button"
            className={BUTTON}
            disabled={switching}
            onClick={() => switchChain({ chainId: DEFAULT_CHAIN_ID })}
          >
            {`Switch to chain ${DEFAULT_CHAIN_ID}`}
          </button>
        )}
        <span
          className="border border-line px-3 py-2 font-mono text-label text-text"
          title={address}
        >
          {shortAddress(address)}
        </span>
        <button type="button" className={BUTTON} onClick={() => disconnect()}>
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        className={BUTTON}
        aria-expanded={open}
        aria-haspopup="menu"
        disabled={isPending}
        onClick={() => setOpen((value) => !value)}
      >
        {isPending ? "Connecting" : "Connect wallet"}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-2 w-60 border border-line-strong bg-surface p-2"
        >
          {connectors.map((connector) => (
            <button
              key={connector.uid}
              type="button"
              role="menuitem"
              className="block w-full px-3 py-2 text-left font-mono text-label uppercase text-text hover:bg-bg hover:text-accent"
              onClick={() => {
                connect({ connector });
                setOpen(false);
              }}
            >
              {connector.id === "injected" ? "Browser wallet" : connector.name}
            </button>
          ))}
          {error !== null && (
            <p role="alert" className="mt-2 px-3 font-mono text-label uppercase text-muted">
              {describeError(error)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

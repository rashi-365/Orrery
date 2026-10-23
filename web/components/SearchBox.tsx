"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { getMarket } from "@/lib/market";
import { matchesQuery } from "@/lib/search";
import { Kbd } from "./Kbd";

/** Tokens page if any token matches, pools page if any pool matches, otherwise tokens. */
function resolveTarget(query: string): "/tokens" | "/pools" {
  const { tokens, pools } = getMarket();
  if (tokens.some((t) => matchesQuery(`${t.symbol} ${t.name} ${t.address}`, query))) {
    return "/tokens";
  }
  if (pools.some((p) => matchesQuery(`${p.label} ${p.address}`, query))) {
    return "/pools";
  }
  return "/tokens";
}

export function SearchBox() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target;
      const typing =
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      if ((event.key === "k" || event.key === "K") && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        inputRef.current?.focus();
        return;
      }
      if (event.key === "/" && !typing) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed === "") return;
    router.push(`${resolveTarget(trimmed)}?q=${encodeURIComponent(trimmed)}`);
    inputRef.current?.blur();
  }

  return (
    <form role="search" onSubmit={onSubmit} className="relative">
      <label htmlFor="global-search" className="sr-only">
        Search tokens and pools
      </label>
      <input
        id="global-search"
        ref={inputRef}
        type="text"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="SEARCH"
        autoComplete="off"
        spellCheck={false}
        className="w-full rounded border border-line bg-transparent py-2 pl-3 pr-32 font-mono text-data uppercase text-text placeholder:text-muted focus:border-accent focus:outline-none"
      />
      <span className="pointer-events-none absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
        <Kbd>/</Kbd>
        <Kbd>Ctrl</Kbd>
        <Kbd>K</Kbd>
      </span>
    </form>
  );
}

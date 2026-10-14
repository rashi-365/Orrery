"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP_NAME, APP_TAGLINE } from "@/config/app";
import { NAV_ITEMS } from "@/config/nav";
import { cx } from "@/lib/format";
import { ConnectButton } from "./ConnectButton";
import { Logo } from "./Logo";
import { SearchBox } from "./SearchBox";
import { Stat } from "./Stat";

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function TopBar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg">
      <div className="px-4 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-8 gap-y-3 py-3">
          <Link
            href="/"
            aria-label={`${APP_NAME} home`}
            className="flex shrink-0 items-center gap-3 text-text"
          >
            <Logo size={28} />
            <span className="flex flex-col">
              <span className="font-sans text-sm font-semibold uppercase tracking-wordmark">
                {APP_NAME}
              </span>
              <span className="font-mono text-label uppercase text-muted">{APP_TAGLINE}</span>
            </span>
          </Link>

          <nav aria-label="Primary" className="flex items-end gap-1">
            {NAV_ITEMS.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "border-b px-3 py-2 font-sans text-xs font-medium uppercase tracking-label transition-colors",
                    active ? "border-teal text-text" : "border-transparent text-muted hover:text-text",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="min-w-[220px] flex-1 lg:max-w-sm">
            <SearchBox />
          </div>

          <div className="ml-auto flex items-center gap-6">
            <Stat label="Total TVL" value={null} align="right" />
            <ConnectButton />
          </div>
        </div>
      </div>
    </header>
  );
}

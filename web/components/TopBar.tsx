"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP_NAME, APP_TAGLINE } from "@/config/app";
import { NAV_ITEMS } from "@/config/nav";
import { cx } from "@/lib/format";
import { ConnectButton } from "./ConnectButton";
import { Logo } from "./Logo";
import { SearchBox } from "./SearchBox";
import { TotalTvl } from "./TotalTvl";

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function TopBar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg">
      <div className="px-4 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-3 py-3 lg:flex-nowrap xl:gap-x-8">
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

          <nav aria-label="Primary" className="flex shrink-0 items-end gap-1">
            {NAV_ITEMS.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "border-b px-3 py-2 font-sans text-xs font-medium uppercase tracking-label transition-colors",
                    active ? "border-accent text-text" : "border-transparent text-muted hover:text-text",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="min-w-[200px] flex-1 lg:min-w-[140px] lg:max-w-sm">
            <SearchBox />
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-4 xl:gap-6">
            <TotalTvl />
            <ConnectButton />
          </div>
        </div>
      </div>
    </header>
  );
}

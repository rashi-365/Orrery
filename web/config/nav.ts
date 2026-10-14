export type NavItem = {
  readonly label: string;
  readonly href: string;
};

export const NAV_ITEMS: readonly NavItem[] = [
  { label: "Home", href: "/" },
  { label: "Tokens", href: "/tokens" },
  { label: "Pools", href: "/pools" },
  { label: "Swap", href: "/swap" },
  { label: "Liquidity", href: "/liquidity" },
];

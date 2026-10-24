# Orrery

**Live Liquidity Network.** Orrery is an AMM (automated market maker) DEX: a decentralized exchange where users swap tokens directly against liquidity pools instead of an order book. Liquidity providers deposit token pairs into pools, and prices are set automatically by a formula based on the reserves in each pool. It runs on a local Anvil chain with a live visual dashboard, where tokens are drawn as planets in a network graph. Pools are the links between them, sized by TVL and colored by buy/sell pressure.

## What's inside

- **Contracts** (Solidity, Foundry): factory, router and pair contracts, plus 16 test tokens with mixed decimals (6, 8 and 18).
- **Web app** (Next.js, TypeScript): token network graph, ranked token panel (volume, 5m/1h/24h windows), pools, swap and liquidity pages, and a live trade feed.
- **Simulator**: a script that funds wallets and sends random small/medium/large swaps, so the dashboard has live activity.

## Prerequisites

- [Foundry](https://book.getfoundry.sh/) (`forge`, `anvil`, `cast`)
- Node.js and npm
- Git (Windows users: run everything inside WSL)

## Quick start

```bash
git clone --recurse-submodules https://github.com/rashi-365/Orrery.git
cd Orrery

cp .env.example .env
# edit .env: set DEPLOYER_PRIVATE_KEY to Anvil's account (0) key
# 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
# (a public test key; never put a real key here)

(cd web && npm install)
(cd scripts && npm install)

bash scripts/up.sh --sim
```

Then open <http://localhost:3000>.

`up.sh` starts a fresh Anvil, deploys the contracts, builds the site (only if the source changed), starts it, and with `--sim` starts the trade simulator. Logs are in `/tmp/orrery`. Stop everything with:

```bash
bash scripts/down.sh
```

Leave out `--sim` to run without the simulator.

## Using a wallet

1. Add a network in MetaMask: RPC `http://127.0.0.1:8545`, chain ID `31337`.
2. Import an Anvil test account if you need funded ETH.
3. After every restart the chain is fresh, so clear MetaMask's activity tab data (Settings, Advanced) to reset its nonces.

## Project layout

```
contracts/   Solidity contracts + Foundry deploy script
web/         Next.js frontend (config/deployments/31337.json holds local addresses)
scripts/     up.sh / down.sh and the trade simulator
```

## Troubleshooting

- `STOP: DEPLOYER_PRIVATE_KEY ... must be Anvil account (0)`: the key in `.env` is not Anvil's first account.
- `STOP: the deployed addresses differ from the committed ones`: the deployment didn't start from a clean chain. Run `bash scripts/down.sh` and try again.
- Dashboard shows `$0.00` everywhere: give the simulator a minute, or check `/tmp/orrery/simulator.log`.

## Security

For local development and demos only. See [SECURITY.md](SECURITY.md).

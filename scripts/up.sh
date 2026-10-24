#!/usr/bin/env bash
# Starts everything for local use: a fresh Anvil, the deployment, the website (rebuilt only
# when its source changed) and, with --sim, the simulator.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
ACCOUNT0="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
LOGS=/tmp/orrery

"$ROOT/scripts/down.sh"
mkdir -p "$LOGS"
set -a; source "$ROOT/.env"; set +a

DEPLOYER="$(cast wallet address --private-key "$DEPLOYER_PRIVATE_KEY")"
if [ "${DEPLOYER,,}" != "${ACCOUNT0,,}" ]; then
  echo "STOP: DEPLOYER_PRIVATE_KEY in .env must be Anvil account (0), the one starting 0xf39F. It is $DEPLOYER."
  exit 1
fi

nohup anvil > "$LOGS/anvil.log" 2>&1 &
for _ in $(seq 1 30); do
  if cast chain-id --rpc-url "$RPC_URL" > /dev/null 2>&1; then break; fi
  sleep 1
done
cast chain-id --rpc-url "$RPC_URL" > /dev/null 2>&1 || { echo "STOP: Anvil did not start. See $LOGS/anvil.log"; exit 1; }

git checkout -- web/config/deployments/31337.json
(cd contracts && forge script script/Deploy.s.sol:Deploy --rpc-url "$RPC_URL" --private-key "$DEPLOYER_PRIVATE_KEY" --broadcast) > "$LOGS/deploy.log" 2>&1 \
  || { tail -20 "$LOGS/deploy.log"; echo "STOP: deploy failed"; exit 1; }

SRC_HASH="$(find web/app web/components web/lib web/config web/middleware.ts web/next.config.mjs web/tailwind.config.ts web/package.json -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum | cut -d' ' -f1)"
if [ ! -f web/.next/BUILD_ID ] || [ "$(cat web/.next/orrery-source.sha 2>/dev/null || true)" != "$SRC_HASH" ]; then
  echo "Building the website (about a minute)..."
  (cd web && npm run build) > "$LOGS/build.log" 2>&1 || { tail -30 "$LOGS/build.log"; echo "STOP: build failed"; exit 1; }
  echo "$SRC_HASH" > web/.next/orrery-source.sha
fi

(cd web && nohup npm run start > "$LOGS/web.log" 2>&1 &)
if [ "${1:-}" = "--sim" ]; then
  (cd scripts && nohup npm run simulate > "$LOGS/simulator.log" 2>&1 &)
fi
sleep 3
echo "READY: open http://localhost:3000   (logs are in $LOGS; stop everything with: bash scripts/down.sh)"

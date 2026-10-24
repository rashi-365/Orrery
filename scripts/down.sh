#!/usr/bin/env bash
# Stops Anvil, the website and the simulator.
pkill -f "next start" 2>/dev/null || true
pkill -f "next-server" 2>/dev/null || true
pkill -f "src/simulator.ts" 2>/dev/null || true
pkill -x anvil 2>/dev/null || true
sleep 1
echo "stopped"

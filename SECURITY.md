# Security

## Status

This is a portfolio and learning project. It has not been independently audited and must
not be used with real funds. It targets a local Anvil chain and the Sepolia testnet only.

Scope of this document: the contracts in `contracts/src` (Factory, Pair, Router,
AmmLibrary, UQ112x112 and their interfaces). Mock tokens, scripts and the web app are
out of scope here.

## Design decisions that reduce attack surface

- No flash swaps. `Pair.swap` has no callback; input tokens must already be in the pair.
- No upgradeability, no proxies, no pause, and no admin function that can move or trap funds.
- The Router is stateless apart from an immutable factory address and never holds tokens.
- Solidity 0.8.24 with checked arithmetic. The only `unchecked` blocks are in the oracle
  accumulator and timestamp subtraction in `Pair._update`, each with a justification comment.
- OpenZeppelin is pinned to v5.0.2 as a git submodule.
- Custom errors throughout, and NatSpec on every external function.

## Roles and trust assumptions

| Actor | Can | Cannot |
|---|---|---|
| Factory owner (two-step transfer) | Set `feeTo`, which turns the protocol fee on or off | Pause, change the fee rate, move funds, upgrade, or renounce ownership |
| Anyone | Create a pair for any two contracts, add and remove liquidity, swap, call `skim` and `sync` | Re-initialize a pair or call `initialize` directly |
| Token issuers | Whatever their token contract allows | Nothing here constrains them; see limitations |
| Block producers | Order transactions and set the timestamp within consensus bounds | Nothing beyond normal MEV |

The worst a compromised owner key can do is turn the protocol fee on and direct it to an
address of their choice. The fee mints new shares equal to one sixth of fee growth (0.05% of
swap volume). It cannot touch LP principal.

Tokens are assumed to be standard ERC20 contracts without transfer fees, rebasing,
callbacks, or issuer-controlled freezes.

## Attack scenarios considered

| Scenario | Mitigation | Test |
|---|---|---|
| Re-entry through a hostile token (sync, skim, swap, mint, burn) | `nonReentrant` on all state-changing pair functions | `test_ReentrancyThroughTokenDuring*IsBlocked` |
| Token whose transfer returns false, or returns nothing | SafeERC20 | `test_FalseReturningTransfer*`, `test_TokenReturningNothing*` |
| Fee-on-transfer token | Invariant check uses actual balances; Router reverts | `test_FeeOnTransfer*`, `test_RouterSwapWithFeeOnTransferInputReverts` |
| First-depositor and donation share inflation | 1000 shares locked forever, rounding favors the pool | `test_DonationInflationAttack*` |
| Value extraction through rounding | Outputs round down, required inputs round up | fuzz tests and `invariant_ShareValueNeverDecreases` |
| 6 vs 18 decimal mismatch | Raw-unit math; dust trades revert instead of donating | `test_DustTradeAgainstMixedDecimalPool*`, `testFuzz_RouterQuoteMatchesExecutedSwapAcrossDecimals` |
| Zero-amount calls | Dedicated custom errors | `test_RouterSwapOfZero*`, `test_PairMintWithoutDepositReverts` and others |
| Same-token path, zero address, missing pair | Rejected in Library, Factory and Router | `test_SwapPathWithSameTokenReverts`, `RevertPaths.t.sol` |
| Sandwich attack | Slippage and deadline bounds limit the loss; ordering cannot be prevented | `test_Sandwich*` |
| Oracle manipulation | Documented as manipulable; a long window averages it away | `test_ShortLivedPriceSpikeBarelyMovesAOneHourAverage` |
| Reserve or k overflow | `uint112` bound check in `_update`, checked arithmetic elsewhere | `test_SyncRevertsWhenToken*BalanceExceedsUint112` |
| Router custody of user funds | Stateless; tests assert its balances stay zero | `Router.t.sol` |
| Re-initializing or hijacking a pair | `Forbidden` and `AlreadyInitialized` | `test_InitializeIsFactoryOnly`, `test_PairInitializeRevertsWhenAlreadyInitialized` |
| Protocol fee abuse | Owner-only, bounded as described above | `ProtocolFee.t.sol` |

## Known limitations

- **MEV and sandwiching.** The protocol cannot stop it. Without a `minOut`, a swap can be
  sandwiched for profit (`test_SandwichProfitsWhenVictimHasNoSlippageLimit` demonstrates it).
  Always set slippage bounds and deadlines.
- **Price oracle.** The cumulative price is manipulable within a block and over short
  windows. Do not read it as a spot price; use time-weighted averages over long windows.
- **Read-only reentrancy.** `getReserves()` is not locked, so during a token callback inside
  `burn` or `swap` it returns pre-update reserves. Writes are blocked; only a third-party
  contract reading this pool from inside a token callback could be misled.
- **Unsupported tokens.** Fee-on-transfer tokens revert at the Router. Rebasing tokens can
  leave reserves out of step with balances until `sync()` is called. Tokens with callbacks
  are not supported. Tokens whose issuer can pause or blocklist addresses can freeze swaps
  and withdrawals for that pool, which the protocol cannot prevent.
- **Permissionless pairs.** Anyone can create a pair for any two contracts, including
  malicious ones. The web app only uses addresses from its deploy config.
- **First deposit sets the price.** Whoever seeds a pair chooses its ratio. Later depositors
  are protected by the Router's minimum-amount arguments, so always set them.
- **Direct transfers are donations.** Tokens sent straight to a pair can be claimed by anyone
  through `skim` or absorbed by `sync`.
- **Locked shares.** The first depositor permanently loses 1000 share units.
- **LP token.** Standard ERC20 without permit.
- **Reserve cap.** Reserves are limited to 2^112 - 1; larger balances make the pool revert
  rather than corrupt state.
- **Timestamp.** The oracle stores time modulo 2^32, which wraps in 2106 and is handled by
  wrapping subtraction.

## Static analysis

Slither 0.11.6 reported 23 results. None is a vulnerability. Each accepted finding is
suppressed with a detector-specific `slither-disable-start` and `slither-disable-end` pair
around only the function concerned, so new findings elsewhere still appear. Current result:
0 findings.

| Detector | Where | Reason accepted |
|---|---|---|
| weak-prng, timestamp | `_update`, `mint`, `swap`, `_mintFee` | The 32-bit timestamp feeds the oracle; no randomness is involved |
| incorrect-equality | `mint`, `burn`, `swap` | Zero checks on amounts and supply, not balance comparisons |
| reentrancy-no-eth, reentrancy-benign | `burn`, `swap` | Tokens are sent before reserves update, as in Uniswap V2; `nonReentrant` makes this safe and the reentrancy tests exercise it |
| unused-return | Router | Ignored tuple members are intentional; the pair is looked up again after `createPair` |
| missing-zero-check | `initialize`, `setFeeTo` | Only the Factory can call `initialize` after validating tokens; zero `feeTo` turns the fee off |
| calls-loop | `Router._swap` | A multi-hop route must call each pair; the caller chooses the path and pays the gas |
| too-many-digits | `Factory.pairInitCodeHash` | It hashes the creation code |

## Verification

- 110 tests across 9 suites: unit tests, attack scenarios, 9 fuzz tests (1000 runs each),
  and 7 properties under handler-based invariant testing (256 runs, depth 64).
- Coverage of `contracts/src`: 100% of lines, statements, branches and functions.
- Mutation check: changing `mint` to credit the larger side of a deposit makes
  `invariant_ShareValueNeverDecreases` fail, so the invariants detect that class of bug.
- The gas snapshot in `contracts/.gas-snapshot` records the gas cost of the unit tests.

## Reporting a vulnerability

Please report privately through GitHub security advisories on this repository, not in
a public issue.

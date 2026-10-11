// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Factory} from "../../src/Factory.sol";
import {Pair} from "../../src/Pair.sol";
import {TestToken} from "../mocks/TestToken.sol";
import {Handler} from "./Handler.sol";

/// Why this file exists: unit and fuzz tests start from chosen states. Here the fuzzer
/// chooses long random sequences of operations and, after every step, the properties
/// below must still hold. Together they cover: k never decreases outside burns, value per
/// share never decreases (nobody can drain LPs through rounding), token balances always
/// match what flowed in minus out, share supply is fully accounted for, and the locked
/// minimum liquidity can never be released.
contract PairInvariantTest is Test {
    Factory internal factory;
    Pair internal pair;
    TestToken internal token0;
    TestToken internal token1;
    Handler internal handler;

    function setUp() public {
        factory = new Factory(address(this));
        TestToken a = new TestToken("A", "A", 18);
        TestToken b = new TestToken("B", "B", 18);
        pair = Pair(factory.createPair(address(a), address(b)));
        token0 = TestToken(pair.token0());
        token1 = TestToken(pair.token1());
        handler = new Handler(pair);

        bytes4[] memory selectors = new bytes4[](7);
        selectors[0] = Handler.addLiquidity.selector;
        selectors[1] = Handler.removeLiquidity.selector;
        selectors[2] = Handler.swap.selector;
        selectors[3] = Handler.donate.selector;
        selectors[4] = Handler.sync.selector;
        selectors[5] = Handler.skim.selector;
        selectors[6] = Handler.warp.selector;
        // Only the handler may be fuzzed. Without this, Foundry also calls the pair,
        // factory and tokens directly, bypassing the handler's ledger.
        targetContract(address(handler));
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
    }

    /// Sanity check that the handler really moves the pool: every operation is run once
    /// with known values, so the invariants below are not passing on an idle pool.
    function test_HandlerExercisesEveryOperation() public {
        handler.addLiquidity(0, 1e12, 2e12);
        handler.addLiquidity(1, 5e11, 1e12);
        handler.swap(2, 1e11, true);
        handler.swap(0, 1e11, false);
        handler.donate(1e9, false);
        handler.skim(1);
        handler.donate(1e9, true);
        handler.sync();
        handler.warp(100);
        handler.removeLiquidity(0, 1e9);

        assertEq(handler.mintCalls(), 2);
        assertEq(handler.swapCalls(), 2);
        assertEq(handler.burnCalls(), 1);
        assertGt(pair.totalSupply(), pair.MINIMUM_LIQUIDITY());
        assertFalse(handler.kDecreased());
        assertFalse(handler.shareValueDecreased());
        assertFalse(handler.oracleDecreased());
        assertEq(token0.balanceOf(address(pair)), handler.totalIn0() - handler.totalOut0());
        assertEq(token1.balanceOf(address(pair)), handler.totalIn1() - handler.totalOut1());
    }

    /// k only drops through burns. Swaps, syncs and skims must never lower it.
    function invariant_ReserveProductNeverDecreasesOutsideBurns() public view {
        assertFalse(handler.kDecreased());
    }

    /// Value per share never drops across mint, burn, swap or sync: rounding favors the pool.
    function invariant_ShareValueNeverDecreases() public view {
        assertFalse(handler.shareValueDecreased());
    }

    /// The cumulative price oracle only ever moves forward.
    function invariant_OracleNeverDecreases() public view {
        assertFalse(handler.oracleDecreased());
    }

    /// Reserves are never larger than the real token balances.
    function invariant_TokenBalancesCoverReserves() public view {
        (uint112 r0, uint112 r1,) = pair.getReserves();
        assertGe(token0.balanceOf(address(pair)), r0);
        assertGe(token1.balanceOf(address(pair)), r1);
    }

    /// Conservation: the pair holds exactly what flowed in minus what flowed out, so no
    /// path creates or destroys tokens, and no one can take out more than went in overall.
    function invariant_PoolBalanceEqualsNetFlow() public view {
        assertEq(token0.balanceOf(address(pair)), handler.totalIn0() - handler.totalOut0());
        assertEq(token1.balanceOf(address(pair)), handler.totalIn1() - handler.totalOut1());
    }

    /// Every share ever minted is held by an actor, locked, or sitting in the pair mid-burn.
    function invariant_LpSupplyEqualsHoldersPlusLockedShares() public view {
        uint256 held = pair.balanceOf(pair.DEAD()) + pair.balanceOf(address(pair));
        for (uint256 i; i < handler.actorCount(); i++) {
            held += pair.balanceOf(handler.actors(i));
        }
        assertEq(pair.totalSupply(), held);
    }

    /// Once liquidity exists, the first 1000 shares stay locked and supply never falls below them.
    function invariant_MinimumLiquidityStaysLocked() public view {
        if (pair.totalSupply() == 0) return;
        assertEq(pair.balanceOf(pair.DEAD()), pair.MINIMUM_LIQUIDITY());
        assertGe(pair.totalSupply(), pair.MINIMUM_LIQUIDITY());
    }
}

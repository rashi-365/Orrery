// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {CommonBase} from "forge-std/Base.sol";
import {StdUtils} from "forge-std/StdUtils.sol";
import {Pair} from "../../src/Pair.sol";
import {AmmLibrary} from "../../src/libraries/AmmLibrary.sol";
import {TestToken} from "../mocks/TestToken.sol";

/// @dev Drives one pair through random sequences of liquidity changes, swaps, donations,
///      skims, syncs and time jumps, while keeping a ledger of every token that flows in
///      or out. The invariant test reads this ledger and the flags below.
///      Amounts are capped at 1e15 per call so that the products used in the share-value
///      check (k * supply * supply) stay far below 2^256 even at the configured depth.
contract Handler is CommonBase, StdUtils {
    uint256 internal constant MAX_AMOUNT = 1e15;
    uint256 internal constant FIRST_DEPOSIT_MIN = 2_000;

    Pair public immutable pair;
    TestToken public immutable token0;
    TestToken public immutable token1;
    address[] public actors;

    // Ledger of all tokens that entered or left the pair through this handler.
    uint256 public totalIn0;
    uint256 public totalIn1;
    uint256 public totalOut0;
    uint256 public totalOut1;

    // Violation flags. They only ever flip to true.
    bool public kDecreased;
    bool public shareValueDecreased;
    bool public oracleDecreased;

    // Call counters, used by the sanity test.
    uint256 public mintCalls;
    uint256 public burnCalls;
    uint256 public swapCalls;

    uint256 internal lastCumulative0;
    uint256 internal lastCumulative1;

    constructor(Pair pair_) {
        pair = pair_;
        token0 = TestToken(pair_.token0());
        token1 = TestToken(pair_.token1());
        actors.push(address(0x1001));
        actors.push(address(0x1002));
        actors.push(address(0x1003));
    }

    modifier track() {
        _;
        uint256 c0 = pair.price0CumulativeLast();
        uint256 c1 = pair.price1CumulativeLast();
        if (c0 < lastCumulative0 || c1 < lastCumulative1) oracleDecreased = true;
        lastCumulative0 = c0;
        lastCumulative1 = c1;
    }

    function actorCount() external view returns (uint256) {
        return actors.length;
    }

    function addLiquidity(uint256 actorSeed, uint256 amount0, uint256 amount1) external track {
        uint256 floor = pair.totalSupply() == 0 ? FIRST_DEPOSIT_MIN : 1;
        uint256 a0 = bound(amount0, floor, MAX_AMOUNT);
        uint256 a1 = bound(amount1, floor, MAX_AMOUNT);
        (uint256 kBefore, uint256 supplyBefore) = _snapshot();

        token0.mint(address(pair), a0);
        token1.mint(address(pair), a1);
        totalIn0 += a0;
        totalIn1 += a1;
        pair.mint(_actor(actorSeed));

        _checkShareValue(kBefore, supplyBefore);
        mintCalls++;
    }

    function removeLiquidity(uint256 actorSeed, uint256 shareSeed) external track {
        address actor = _actor(actorSeed);
        uint256 held = pair.balanceOf(actor);
        if (held == 0) return;
        uint256 shares = bound(shareSeed, 1, held);
        (uint256 kBefore, uint256 supplyBefore) = _snapshot();

        vm.prank(actor);
        pair.transfer(address(pair), shares);
        (uint256 a0, uint256 a1) = pair.burn(actor);
        totalOut0 += a0;
        totalOut1 += a1;

        _checkShareValue(kBefore, supplyBefore);
        burnCalls++;
    }

    function swap(uint256 actorSeed, uint256 amountSeed, bool zeroForOne) external track {
        if (pair.totalSupply() == 0) return;
        (uint112 r0, uint112 r1,) = pair.getReserves();
        if (r0 == 0 || r1 == 0) return;
        uint256 amountIn = bound(amountSeed, 1, MAX_AMOUNT);
        uint256 amountOut = zeroForOne
            ? AmmLibrary.getAmountOut(amountIn, r0, r1)
            : AmmLibrary.getAmountOut(amountIn, r1, r0);
        if (amountOut == 0) return;
        (uint256 kBefore, uint256 supplyBefore) = _snapshot();

        address to = _actor(actorSeed);
        if (zeroForOne) {
            token0.mint(address(pair), amountIn);
            pair.swap(0, amountOut, to);
            totalIn0 += amountIn;
            totalOut1 += amountOut;
        } else {
            token1.mint(address(pair), amountIn);
            pair.swap(amountOut, 0, to);
            totalIn1 += amountIn;
            totalOut0 += amountOut;
        }

        (uint256 kAfter,) = _snapshot();
        if (kAfter < kBefore) kDecreased = true;
        _checkShareValue(kBefore, supplyBefore);
        swapCalls++;
    }

    /// @dev Sends tokens straight to the pair without minting shares, as a donor would.
    function donate(uint256 amountSeed, bool zeroToken) external track {
        uint256 amount = bound(amountSeed, 1, MAX_AMOUNT);
        if (zeroToken) {
            token0.mint(address(pair), amount);
            totalIn0 += amount;
        } else {
            token1.mint(address(pair), amount);
            totalIn1 += amount;
        }
    }

    function sync() external track {
        (uint256 kBefore, uint256 supplyBefore) = _snapshot();
        pair.sync();
        (uint256 kAfter,) = _snapshot();
        if (kAfter < kBefore) kDecreased = true;
        _checkShareValue(kBefore, supplyBefore);
    }

    function skim(uint256 actorSeed) external track {
        (uint112 r0, uint112 r1,) = pair.getReserves();
        uint256 excess0 = token0.balanceOf(address(pair)) - r0;
        uint256 excess1 = token1.balanceOf(address(pair)) - r1;
        pair.skim(_actor(actorSeed));
        totalOut0 += excess0;
        totalOut1 += excess1;
    }

    function warp(uint256 secondsSeed) external track {
        vm.warp(block.timestamp + bound(secondsSeed, 1, 1 days));
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    function _snapshot() internal view returns (uint256 k, uint256 supply) {
        (uint112 r0, uint112 r1,) = pair.getReserves();
        k = uint256(r0) * r1;
        supply = pair.totalSupply();
    }

    /// @dev Share value is k / supply^2 (value per share, squared). Cross-multiplied to
    ///      avoid division. Rounding always favors the pool, so it must never decrease.
    function _checkShareValue(uint256 kBefore, uint256 supplyBefore) internal {
        if (supplyBefore == 0) return;
        (uint256 kAfter, uint256 supplyAfter) = _snapshot();
        if (supplyAfter == 0) return;
        if (kAfter * supplyBefore * supplyBefore < kBefore * supplyAfter * supplyAfter) {
            shareValueDecreased = true;
        }
    }
}

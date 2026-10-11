// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Factory} from "../src/Factory.sol";
import {Pair} from "../src/Pair.sol";
import {Router} from "../src/Router.sol";
import {AmmLibrary} from "../src/libraries/AmmLibrary.sol";
import {TestToken} from "./mocks/TestToken.sol";

/// Why this file exists: unit tests check chosen numbers; these check the math and the
/// pool's rounding rules across the whole input space. Reserves range from 10,000 wei to
/// 1e30 so both dust-sized and whale-sized pools are covered. Swap sizes range from
/// 0.1% to 100x of the input reserve. Arguments are always computed before
/// vm.expectRevert / vm.prank, which attach to the next external call.
contract FuzzTest is Test {
    struct Pool {
        Pair pair;
        TestToken t0;
        TestToken t1;
        uint256 r0;
        uint256 r1;
    }

    uint256 internal constant MIN_RESERVE = 10_000;
    uint256 internal constant MAX_RESERVE = 1e30;

    Factory internal factory;
    Router internal router;
    address internal alice = makeAddr("alice");
    address internal trader = makeAddr("trader");

    function setUp() public {
        factory = new Factory(address(this));
        router = new Router(address(factory));
    }

    // ---------------------------------------------------------------- helpers

    function _newPool(uint256 seed0, uint256 seed1) internal returns (Pool memory p) {
        p.r0 = bound(seed0, MIN_RESERVE, MAX_RESERVE);
        p.r1 = bound(seed1, MIN_RESERVE, MAX_RESERVE);
        TestToken a = new TestToken("A", "A", 18);
        TestToken b = new TestToken("B", "B", 18);
        p.pair = Pair(factory.createPair(address(a), address(b)));
        p.t0 = TestToken(p.pair.token0());
        p.t1 = TestToken(p.pair.token1());
        p.t0.mint(address(p.pair), p.r0);
        p.t1.mint(address(p.pair), p.r1);
        p.pair.mint(alice);
    }

    function _dir(Pool memory p, bool zeroForOne)
        internal
        pure
        returns (uint256 rIn, uint256 rOut)
    {
        (rIn, rOut) = zeroForOne ? (p.r0, p.r1) : (p.r1, p.r0);
    }

    function _swapIn(
        Pool memory p,
        bool zeroForOne,
        uint256 amountIn,
        uint256 amountOut,
        address to
    ) internal {
        if (zeroForOne) {
            p.t0.mint(address(p.pair), amountIn);
            p.pair.swap(0, amountOut, to);
        } else {
            p.t1.mint(address(p.pair), amountIn);
            p.pair.swap(amountOut, 0, to);
        }
    }

    /// @dev Sends `amountBack` of the previous output token back in and swaps it home.
    function _swapBack(Pool memory p, bool zeroForOne, uint256 amountBack)
        internal
        returns (uint256 out2)
    {
        (uint112 n0, uint112 n1,) = p.pair.getReserves();
        (uint256 backIn, uint256 backOut) =
            zeroForOne ? (uint256(n1), uint256(n0)) : (uint256(n0), uint256(n1));
        out2 = AmmLibrary.getAmountOut(amountBack, backIn, backOut);
        if (out2 == 0) return 0;
        _swapIn(p, !zeroForOne, amountBack, out2, trader);
    }

    function _seedViaRouter(TestToken a, TestToken b, uint256 ra, uint256 rb) internal {
        a.mint(alice, ra);
        b.mint(alice, rb);
        vm.startPrank(alice);
        a.approve(address(router), ra);
        b.approve(address(router), rb);
        router.addLiquidity(address(a), address(b), ra, rb, 0, 0, alice, block.timestamp + 1 hours);
        vm.stopPrank();
    }

    function _executeSwap(TestToken tIn, TestToken tOut, uint256 amountIn)
        internal
        returns (uint256 quoted)
    {
        address[] memory path = new address[](2);
        path[0] = address(tIn);
        path[1] = address(tOut);
        quoted = router.getAmountsOut(amountIn, path)[1];
        tIn.mint(trader, amountIn);
        vm.startPrank(trader);
        tIn.approve(address(router), amountIn);
        router.swapExactTokensForTokens(amountIn, quoted, path, trader, block.timestamp + 1 hours);
        vm.stopPrank();
    }

    // ------------------------------------------------------------------ swaps

    /// A swap sized by the library formula must never lower reserve0 * reserve1.
    function testFuzz_SwapNeverDecreasesK(
        uint256 seed0,
        uint256 seed1,
        uint256 amountSeed,
        bool zeroForOne
    ) public {
        Pool memory p = _newPool(seed0, seed1);
        (uint256 rIn, uint256 rOut) = _dir(p, zeroForOne);
        uint256 amountIn = bound(amountSeed, rIn / 1000 + 1, rIn * 100);
        uint256 amountOut = AmmLibrary.getAmountOut(amountIn, rIn, rOut);
        uint256 kBefore = p.r0 * p.r1;

        _swapIn(p, zeroForOne, amountIn, amountOut, trader);

        (uint112 n0, uint112 n1,) = p.pair.getReserves();
        assertGe(uint256(n0) * n1, kBefore);
    }

    /// The library quote is exactly the maximum the pair allows: one more unit reverts.
    function testFuzz_OneUnitMoreThanQuotedOutputAlwaysReverts(
        uint256 seed0,
        uint256 seed1,
        uint256 amountSeed,
        bool zeroForOne
    ) public {
        Pool memory p = _newPool(seed0, seed1);
        (uint256 rIn, uint256 rOut) = _dir(p, zeroForOne);
        uint256 amountIn = bound(amountSeed, rIn / 1000 + 1, rIn * 100);
        uint256 amountOut = AmmLibrary.getAmountOut(amountIn, rIn, rOut);

        if (zeroForOne) {
            p.t0.mint(address(p.pair), amountIn);
            vm.expectRevert();
            p.pair.swap(0, amountOut + 1, trader);
        } else {
            p.t1.mint(address(p.pair), amountIn);
            vm.expectRevert();
            p.pair.swap(amountOut + 1, 0, trader);
        }
    }

    /// Swapping in and straight back out always loses money, because of fee and rounding.
    function testFuzz_RoundTripSwapNeverProfits(
        uint256 seed0,
        uint256 seed1,
        uint256 amountSeed,
        bool zeroForOne
    ) public {
        Pool memory p = _newPool(seed0, seed1);
        (uint256 rIn, uint256 rOut) = _dir(p, zeroForOne);
        uint256 amountIn = bound(amountSeed, rIn / 1000 + 1, rIn * 100);
        uint256 out1 = AmmLibrary.getAmountOut(amountIn, rIn, rOut);
        _swapIn(p, zeroForOne, amountIn, out1, trader);

        uint256 out2 = _swapBack(p, zeroForOne, out1);
        vm.assume(out2 > 0);
        assertLt(out2, amountIn);
    }

    // -------------------------------------------------------------- liquidity

    /// A second depositor who adds and immediately removes liquidity gets back no more
    /// than they put in (rounding favors the pool).
    function testFuzz_SecondDepositorCannotProfitFromImmediateWithdrawal(
        uint256 seed0,
        uint256 seed1,
        uint256 multSeed
    ) public {
        Pool memory p = _newPool(seed0, seed1);
        uint256 m = bound(multSeed, 1, 1000);
        uint256 d0 = (p.r0 * m) / 100;
        uint256 d1 = (p.r1 * m) / 100;
        p.t0.mint(address(p.pair), d0);
        p.t1.mint(address(p.pair), d1);
        uint256 shares = p.pair.mint(trader);
        assertGt(shares, 0);

        vm.prank(trader);
        p.pair.transfer(address(p.pair), shares);
        (uint256 a0, uint256 a1) = p.pair.burn(trader);
        assertLe(a0, d0);
        assertLe(a1, d1);
    }

    /// The first depositor always loses a little to the permanently locked shares.
    function testFuzz_FirstDepositorLosesTheLockedShares(uint256 seed0, uint256 seed1) public {
        Pool memory p = _newPool(seed0, seed1);
        uint256 shares = p.pair.balanceOf(alice);
        vm.prank(alice);
        p.pair.transfer(address(p.pair), shares);
        (uint256 a0, uint256 a1) = p.pair.burn(alice);
        assertLt(a0, p.r0);
        assertLt(a1, p.r1);
    }

    // ---------------------------------------------------------- library rounding

    /// Paying the amount getAmountIn asks for always yields at least the requested output.
    function testFuzz_GetAmountInCoversRequestedOutput(
        uint256 rInSeed,
        uint256 rOutSeed,
        uint256 outSeed
    ) public pure {
        uint256 rIn = bound(rInSeed, MIN_RESERVE, MAX_RESERVE);
        uint256 rOut = bound(rOutSeed, MIN_RESERVE, MAX_RESERVE);
        uint256 out = bound(outSeed, 1, (rOut * 99) / 100);
        uint256 needed = AmmLibrary.getAmountIn(out, rIn, rOut);
        uint256 got = AmmLibrary.getAmountOut(needed, rIn, rOut);
        assertGe(got, out);
    }

    /// No input, however large, can drain the whole output reserve.
    function testFuzz_GetAmountOutNeverReachesReserve(
        uint256 rInSeed,
        uint256 rOutSeed,
        uint256 amountSeed
    ) public pure {
        uint256 rIn = bound(rInSeed, 1, 1e33);
        uint256 rOut = bound(rOutSeed, 1, 1e33);
        uint256 amountIn = bound(amountSeed, 1, 1e33);
        assertLt(AmmLibrary.getAmountOut(amountIn, rIn, rOut), rOut);
    }

    /// quote rounds down, so a deposit never needs more of asset B than the exact ratio.
    function testFuzz_QuoteNeverOverpays(uint256 rASeed, uint256 rBSeed, uint256 aSeed)
        public
        pure
    {
        uint256 rA = bound(rASeed, 1, 1e30);
        uint256 rB = bound(rBSeed, 1, 1e30);
        uint256 a = bound(aSeed, 1, 1e30);
        uint256 b = AmmLibrary.quote(a, rA, rB);
        assertLe(b * rA, a * rB);
    }

    // ------------------------------------------------- router with mixed decimals

    /// The router's quote equals what an executed swap pays, for an 18-decimal / 6-decimal
    /// pool in both directions, and the router never keeps any tokens.
    function testFuzz_RouterQuoteMatchesExecutedSwapAcrossDecimals(
        uint256 seedA,
        uint256 seedB,
        uint256 amountSeed,
        bool aToB
    ) public {
        TestToken a = new TestToken("A", "A", 18);
        TestToken b = new TestToken("B", "B", 6);
        uint256 ra = bound(seedA, 1e18, 1e27);
        uint256 rb = bound(seedB, 1e6, 1e15);
        _seedViaRouter(a, b, ra, rb);

        uint256 amountIn = aToB
            ? bound(amountSeed, ra / 1000 + 1, ra * 10)
            : bound(amountSeed, rb / 1000 + 1, rb * 10);
        (TestToken tIn, TestToken tOut) = aToB ? (a, b) : (b, a);
        uint256 quoted = _executeSwap(tIn, tOut, amountIn);

        assertEq(tOut.balanceOf(trader), quoted);
        assertEq(tIn.balanceOf(address(router)), 0);
        assertEq(tOut.balanceOf(address(router)), 0);
    }
}

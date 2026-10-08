// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Factory} from "../src/Factory.sol";
import {Pair} from "../src/Pair.sol";
import {TestToken} from "./mocks/TestToken.sol";

/// Why this file exists: these are the core pool behaviors every later phase relies on:
/// first-mint locking, fee-adjusted pricing, the invariant check, and proportional burn.
contract PairTest is Test {
    Factory internal factory;
    Pair internal pair;
    TestToken internal token0;
    TestToken internal token1;
    address internal owner = makeAddr("owner");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public {
        factory = new Factory(owner);
        TestToken a = new TestToken("A", "A", 18);
        TestToken b = new TestToken("B", "B", 18);
        pair = Pair(factory.createPair(address(a), address(b)));
        token0 = TestToken(pair.token0());
        token1 = TestToken(pair.token1());
    }

    function _addLiquidity(uint256 a0, uint256 a1) internal returns (uint256) {
        token0.mint(address(pair), a0);
        token1.mint(address(pair), a1);
        return pair.mint(alice);
    }

    function test_FirstMintLocksMinimumLiquidity() public {
        uint256 liquidity = _addLiquidity(4e18, 1e18); // sqrt(4e36) = 2e18
        assertEq(liquidity, 2e18 - 1000);
        assertEq(pair.balanceOf(alice), liquidity);
        assertEq(pair.balanceOf(pair.DEAD()), 1000);
        assertEq(pair.totalSupply(), 2e18);
        (uint112 r0, uint112 r1,) = pair.getReserves();
        assertEq(r0, 4e18);
        assertEq(r1, 1e18);
    }

    function test_FirstMintRevertsBelowMinimumLiquidity() public {
        token0.mint(address(pair), 1000);
        token1.mint(address(pair), 1000);
        vm.expectRevert(Pair.InsufficientLiquidityMinted.selector);
        pair.mint(alice);
    }

    function test_SwapPaysExpectedAmountAfterFee() public {
        _addLiquidity(10e18, 10e18);
        uint256 amountIn = 1e18;
        uint256 expectedOut = (amountIn * 997 * 10e18) / (10e18 * 1000 + amountIn * 997);
        token0.mint(address(pair), amountIn);
        pair.swap(0, expectedOut, bob);
        assertEq(token1.balanceOf(bob), expectedOut);
        (uint112 r0, uint112 r1,) = pair.getReserves();
        assertEq(r0, 11e18);
        assertEq(r1, 10e18 - expectedOut);
    }

    function test_SwapRevertsWhenAskingForMoreThanFeeAdjustedOutput() public {
        _addLiquidity(10e18, 10e18);
        uint256 amountIn = 1e18;
        uint256 expectedOut = (amountIn * 997 * 10e18) / (10e18 * 1000 + amountIn * 997);
        token0.mint(address(pair), amountIn);
        vm.expectRevert(Pair.KInvariant.selector);
        pair.swap(0, expectedOut + 1, bob);
    }

    function test_SwapRevertsWithoutInput() public {
        _addLiquidity(10e18, 10e18);
        vm.expectRevert(Pair.InsufficientInputAmount.selector);
        pair.swap(0, 1e18, bob);
    }

    function test_SwapRevertsOnZeroOutput() public {
        _addLiquidity(10e18, 10e18);
        vm.expectRevert(Pair.InsufficientOutputAmount.selector);
        pair.swap(0, 0, bob);
    }

    function test_SwapRevertsWhenDrainingReserve() public {
        _addLiquidity(10e18, 10e18);
        vm.expectRevert(Pair.InsufficientLiquidity.selector);
        pair.swap(0, 10e18, bob);
    }

    function test_SwapRevertsWhenRecipientIsAPoolToken() public {
        _addLiquidity(10e18, 10e18);
        token0.mint(address(pair), 1e18);
        vm.expectRevert(Pair.InvalidTo.selector);
        pair.swap(0, 1e17, address(token0));
    }

    function test_BurnReturnsProportionalShare() public {
        uint256 liquidity = _addLiquidity(10e18, 10e18);
        vm.prank(alice);
        pair.transfer(address(pair), liquidity);
        (uint256 a0, uint256 a1) = pair.burn(alice);
        assertEq(a0, 10e18 - 1000);
        assertEq(a1, 10e18 - 1000);
        assertEq(token0.balanceOf(alice), 10e18 - 1000);
        assertEq(token1.balanceOf(alice), 10e18 - 1000);
        assertEq(pair.totalSupply(), 1000);
    }

    function test_BurnRevertsWithNoShares() public {
        _addLiquidity(10e18, 10e18);
        vm.expectRevert(Pair.InsufficientLiquidityBurned.selector);
        pair.burn(alice);
    }

    function test_InitializeIsFactoryOnly() public {
        vm.expectRevert(Pair.Forbidden.selector);
        pair.initialize(address(token0), address(token1));
    }

    function test_OracleAccumulatesWithTime() public {
        _addLiquidity(4e18, 1e18);
        vm.warp(block.timestamp + 100);
        pair.sync();
        // price0 = reserve1 / reserve0 = 0.25 in UQ112x112, over 100 seconds.
        assertEq(pair.price0CumulativeLast(), (uint256(2 ** 112) / 4) * 100);
        assertEq(pair.price1CumulativeLast(), uint256(2 ** 112) * 4 * 100);
    }
}

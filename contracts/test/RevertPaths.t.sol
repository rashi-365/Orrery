// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Factory} from "../src/Factory.sol";
import {Pair} from "../src/Pair.sol";
import {Router} from "../src/Router.sol";
import {AmmLibrary} from "../src/libraries/AmmLibrary.sol";
import {TestToken} from "./mocks/TestToken.sol";

/// Why this file exists: every custom error in the contracts must be reachable and
/// tested at least once. These are the revert paths and edge branches the other suites
/// do not hit. Arguments are computed before vm.expectRevert / vm.prank, which attach to
/// the next external call.
contract RevertPathsTest is Test {
    Factory internal factory;
    Router internal router;
    Pair internal pair;
    TestToken internal t0;
    TestToken internal t1;
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public {
        factory = new Factory(address(this));
        router = new Router(address(factory));
        TestToken a = new TestToken("A", "A", 18);
        TestToken b = new TestToken("B", "B", 18);
        pair = Pair(factory.createPair(address(a), address(b)));
        t0 = TestToken(pair.token0());
        t1 = TestToken(pair.token1());
        t0.mint(address(pair), 100e18);
        t1.mint(address(pair), 100e18);
        pair.mint(alice);
    }

    function _path(address x, address y) internal pure returns (address[] memory path) {
        path = new address[](2);
        path[0] = x;
        path[1] = y;
    }

    function _approveShares() internal returns (uint256 shares) {
        shares = pair.balanceOf(alice);
        vm.prank(alice);
        pair.approve(address(router), shares);
    }

    // ---------------------------------------------------------------- factory

    function test_FactoryConstructorRejectsZeroOwner() public {
        vm.expectRevert(abi.encodeWithSignature("OwnableInvalidOwner(address)", address(0)));
        new Factory(address(0));
    }

    // ------------------------------------------------------------------- pair

    function test_PairInitializeRevertsWhenAlreadyInitialized() public {
        vm.prank(address(factory));
        vm.expectRevert(Pair.AlreadyInitialized.selector);
        pair.initialize(address(t0), address(t1));
    }

    function test_SyncRevertsWhenToken0BalanceExceedsUint112() public {
        t0.mint(address(pair), type(uint112).max);
        vm.expectRevert(Pair.Overflow.selector);
        pair.sync();
    }

    function test_SyncRevertsWhenToken1BalanceExceedsUint112() public {
        t1.mint(address(pair), type(uint112).max);
        vm.expectRevert(Pair.Overflow.selector);
        pair.sync();
    }

    function test_SwapRevertsWhenRecipientIsToken1() public {
        vm.expectRevert(Pair.InvalidTo.selector);
        pair.swap(0, 1e17, address(t1));
    }

    function test_SwapRevertsWhenRecipientIsZeroAddress() public {
        vm.expectRevert(Pair.InvalidTo.selector);
        pair.swap(0, 1e17, address(0));
    }

    function test_SwapRevertsWhenToken0OutputDrainsReserve() public {
        vm.expectRevert(Pair.InsufficientLiquidity.selector);
        pair.swap(100e18, 0, bob);
    }

    function test_SkimSendsExcessAndLeavesReservesUntouched() public {
        t0.mint(address(pair), 5e18);
        t1.mint(address(pair), 3e18);
        pair.skim(bob);
        assertEq(t0.balanceOf(bob), 5e18);
        assertEq(t1.balanceOf(bob), 3e18);
        (uint112 r0, uint112 r1,) = pair.getReserves();
        assertEq(r0, 100e18);
        assertEq(r1, 100e18);
    }

    /// A very skewed pool lets one side of a small burn round to zero while the other
    /// does not. The burn must still revert, or the burner would give up shares for
    /// only one token.
    function test_BurnRevertsWhenOnlyOneSideRoundsToZero() public {
        TestToken a = new TestToken("A", "A", 18);
        TestToken b = new TestToken("B", "B", 18);
        Pair skewed = Pair(factory.createPair(address(a), address(b)));
        TestToken s0 = TestToken(skewed.token0());
        TestToken s1 = TestToken(skewed.token1());
        s0.mint(address(skewed), 1e18);
        s1.mint(address(skewed), 1e4);
        uint256 shares = skewed.mint(alice);
        assertEq(shares, 1e11 - 1000); // sqrt(1e22) = 1e11

        vm.prank(alice);
        skewed.transfer(address(skewed), 1e6);
        vm.expectRevert(Pair.InsufficientLiquidityBurned.selector);
        skewed.burn(alice);
    }

    // ----------------------------------------------------------------- router

    function test_RemoveLiquidityRevertsAfterDeadline() public {
        vm.warp(1000);
        vm.prank(alice);
        vm.expectRevert(Router.Expired.selector);
        router.removeLiquidity(address(t0), address(t1), 1, 0, 0, alice, 999);
    }

    function test_RemoveLiquidityRevertsOnZeroRecipient() public {
        uint256 deadline = block.timestamp + 1 hours;
        vm.prank(alice);
        vm.expectRevert(Router.ZeroAddress.selector);
        router.removeLiquidity(address(t0), address(t1), 1, 0, 0, address(0), deadline);
    }

    function test_RemoveLiquidityRevertsBelowBMinimum() public {
        uint256 shares = _approveShares();
        uint256 deadline = block.timestamp + 1 hours;
        vm.prank(alice);
        vm.expectRevert(Router.InsufficientBAmount.selector);
        router.removeLiquidity(address(t0), address(t1), shares, 0, 100e18, alice, deadline);
    }

    function test_SwapForExactRevertsAfterDeadline() public {
        address[] memory path = _path(address(t0), address(t1));
        vm.warp(1000);
        vm.prank(alice);
        vm.expectRevert(Router.Expired.selector);
        router.swapTokensForExactTokens(1e18, 10e18, path, bob, 999);
    }

    function test_SwapForExactRevertsOnZeroRecipient() public {
        address[] memory path = _path(address(t0), address(t1));
        uint256 deadline = block.timestamp + 1 hours;
        vm.prank(alice);
        vm.expectRevert(Router.ZeroAddress.selector);
        router.swapTokensForExactTokens(1e18, 10e18, path, address(0), deadline);
    }

    function test_SwapForExactRevertsOnShortPath() public {
        address[] memory path = new address[](1);
        path[0] = address(t0);
        uint256 deadline = block.timestamp + 1 hours;
        vm.prank(alice);
        vm.expectRevert(AmmLibrary.InvalidPath.selector);
        router.swapTokensForExactTokens(1e18, 10e18, path, bob, deadline);
    }

    function test_SwapForExactRevertsWhenPairDoesNotExist() public {
        TestToken c = new TestToken("C", "C", 18);
        address[] memory path = _path(address(t0), address(c));
        uint256 deadline = block.timestamp + 1 hours;
        vm.prank(alice);
        vm.expectRevert(AmmLibrary.PairNotFound.selector);
        router.swapTokensForExactTokens(1e18, 10e18, path, bob, deadline);
    }
}

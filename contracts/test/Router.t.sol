// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Factory} from "../src/Factory.sol";
import {Pair} from "../src/Pair.sol";
import {Router} from "../src/Router.sol";
import {AmmLibrary} from "../src/libraries/AmmLibrary.sol";
import {TestToken} from "./mocks/TestToken.sol";

/// Why this file exists: the router is what users actually call, so liquidity ratio
/// matching, slippage bounds, deadlines, multi-hop routing and the "holds no funds"
/// guarantee are each checked directly. Tokens use 18, 6 and 8 decimals on purpose.
contract RouterTest is Test {
    Factory internal factory;
    Router internal router;
    TestToken internal tokenA; // 18 decimals
    TestToken internal tokenB; // 6 decimals
    TestToken internal tokenC; // 8 decimals
    address internal owner = makeAddr("owner");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public {
        factory = new Factory(owner);
        router = new Router(address(factory));
        tokenA = new TestToken("A", "A", 18);
        tokenB = new TestToken("B", "B", 6);
        tokenC = new TestToken("C", "C", 8);

        tokenA.mint(alice, 1_000_000e18);
        tokenB.mint(alice, 1_000_000e6);
        tokenC.mint(alice, 1_000_000e8);

        vm.startPrank(alice);
        tokenA.approve(address(router), type(uint256).max);
        tokenB.approve(address(router), type(uint256).max);
        tokenC.approve(address(router), type(uint256).max);
        vm.stopPrank();
    }

    function _dl() internal view returns (uint256) {
        return block.timestamp + 1 hours;
    }

    function _seed(address x, address y, uint256 amountX, uint256 amountY) internal {
        uint256 deadline = _dl();
        vm.prank(alice);
        router.addLiquidity(x, y, amountX, amountY, 0, 0, alice, deadline);
    }

    function _path2(address x, address y) internal pure returns (address[] memory path) {
        path = new address[](2);
        path[0] = x;
        path[1] = y;
    }

    function _path3(address x, address y, address z) internal pure returns (address[] memory path) {
        path = new address[](3);
        path[0] = x;
        path[1] = y;
        path[2] = z;
    }

    function _assertRouterEmpty() internal view {
        assertEq(tokenA.balanceOf(address(router)), 0);
        assertEq(tokenB.balanceOf(address(router)), 0);
        assertEq(tokenC.balanceOf(address(router)), 0);
    }

    function test_AddLiquidityCreatesPairAndMintsShares() public {
        uint256 deadline = _dl();
        vm.prank(alice);
        (uint256 amountA, uint256 amountB, uint256 liquidity) =
            router.addLiquidity(address(tokenA), address(tokenB), 10e18, 10e6, 0, 0, alice, deadline);
        assertEq(amountA, 10e18);
        assertEq(amountB, 10e6);
        assertEq(liquidity, 1e13 - 1000); // sqrt(1e19 * 1e7) = 1e13, minus locked shares
        address pair = factory.getPair(address(tokenA), address(tokenB));
        assertTrue(pair != address(0));
        assertEq(Pair(pair).balanceOf(alice), liquidity);
        _assertRouterEmpty();
    }

    function test_AddLiquidityUsesOptimalBWhenAIsLimiting() public {
        _seed(address(tokenA), address(tokenB), 10e18, 10e6);
        uint256 deadline = _dl();
        vm.prank(alice);
        (uint256 amountA, uint256 amountB,) = router.addLiquidity(
            address(tokenA), address(tokenB), 5e18, 100e6, 0, 0, alice, deadline
        );
        assertEq(amountA, 5e18);
        assertEq(amountB, 5e6);
        _assertRouterEmpty();
    }

    function test_AddLiquidityUsesOptimalAWhenBIsLimiting() public {
        _seed(address(tokenA), address(tokenB), 10e18, 10e6);
        uint256 deadline = _dl();
        vm.prank(alice);
        (uint256 amountA, uint256 amountB,) = router.addLiquidity(
            address(tokenA), address(tokenB), 100e18, 5e6, 0, 0, alice, deadline
        );
        assertEq(amountA, 5e18);
        assertEq(amountB, 5e6);
        _assertRouterEmpty();
    }

    function test_AddLiquidityRevertsWhenBBelowMinimum() public {
        _seed(address(tokenA), address(tokenB), 10e18, 10e6);
        uint256 deadline = _dl();
        vm.prank(alice);
        vm.expectRevert(Router.InsufficientBAmount.selector);
        router.addLiquidity(address(tokenA), address(tokenB), 5e18, 100e6, 0, 6e6, alice, deadline);
    }

    function test_AddLiquidityRevertsWhenABelowMinimum() public {
        _seed(address(tokenA), address(tokenB), 10e18, 10e6);
        uint256 deadline = _dl();
        vm.prank(alice);
        vm.expectRevert(Router.InsufficientAAmount.selector);
        router.addLiquidity(address(tokenA), address(tokenB), 100e18, 5e6, 6e18, 0, alice, deadline);
    }

    function test_AddLiquidityRevertsAfterDeadline() public {
        vm.warp(1000);
        vm.prank(alice);
        vm.expectRevert(Router.Expired.selector);
        router.addLiquidity(address(tokenA), address(tokenB), 1e18, 1e6, 0, 0, alice, 999);
    }

    function test_AddLiquidityRevertsOnZeroRecipient() public {
        uint256 deadline = _dl();
        vm.prank(alice);
        vm.expectRevert(Router.ZeroAddress.selector);
        router.addLiquidity(address(tokenA), address(tokenB), 1e18, 1e6, 0, 0, address(0), deadline);
    }

    function test_AddLiquidityRevertsOnIdenticalTokens() public {
        uint256 deadline = _dl();
        vm.prank(alice);
        vm.expectRevert(Factory.IdenticalAddresses.selector);
        router.addLiquidity(address(tokenA), address(tokenA), 1e18, 1e18, 0, 0, alice, deadline);
    }

    function test_RemoveLiquidityReturnsProportionalTokens() public {
        _seed(address(tokenA), address(tokenB), 10e18, 10e6);
        address pair = factory.getPair(address(tokenA), address(tokenB));
        uint256 shares = Pair(pair).balanceOf(alice);
        vm.prank(alice);
        Pair(pair).approve(address(router), shares);

        uint256 deadline = _dl();
        vm.prank(alice);
        (uint256 amountA, uint256 amountB) =
            router.removeLiquidity(address(tokenA), address(tokenB), shares, 0, 0, bob, deadline);
        // Locked shares stay in the pool, so slightly less than the full deposit returns.
        assertEq(amountA, 10e18 - 1e9);
        assertEq(amountB, 9_999_999);
        assertEq(tokenA.balanceOf(bob), amountA);
        assertEq(tokenB.balanceOf(bob), amountB);
        _assertRouterEmpty();
        assertEq(Pair(pair).balanceOf(address(router)), 0);
    }

    function test_RemoveLiquidityRevertsBelowMinimum() public {
        _seed(address(tokenA), address(tokenB), 10e18, 10e6);
        address pair = factory.getPair(address(tokenA), address(tokenB));
        uint256 shares = Pair(pair).balanceOf(alice);
        vm.prank(alice);
        Pair(pair).approve(address(router), shares);

        uint256 deadline = _dl();
        vm.prank(alice);
        vm.expectRevert(Router.InsufficientAAmount.selector);
        router.removeLiquidity(address(tokenA), address(tokenB), shares, 10e18, 0, alice, deadline);
    }

    function test_SwapExactTokensForTokensSingleHop() public {
        _seed(address(tokenA), address(tokenB), 100e18, 100e6);
        uint256 amountIn = 1e18;
        uint256 expected = (amountIn * 997 * 100e6) / (100e18 * 1000 + amountIn * 997);
        uint256 aBefore = tokenA.balanceOf(alice);
        uint256 deadline = _dl();
        address[] memory path = _path2(address(tokenA), address(tokenB));

        vm.prank(alice);
        uint256[] memory amounts = router.swapExactTokensForTokens(1e18, 0, path, bob, deadline);
        assertEq(amounts.length, 2);
        assertEq(amounts[0], 1e18);
        assertEq(amounts[1], expected);
        assertEq(tokenB.balanceOf(bob), expected);
        assertEq(tokenA.balanceOf(alice), aBefore - 1e18);
        _assertRouterEmpty();
    }

    function test_SwapExactTokensForTokensMultiHop() public {
        _seed(address(tokenA), address(tokenB), 100e18, 100e6);
        _seed(address(tokenB), address(tokenC), 100e6, 100e8);
        address[] memory path = _path3(address(tokenA), address(tokenB), address(tokenC));
        uint256[] memory quoted = router.getAmountsOut(1e18, path);
        uint256 deadline = _dl();

        vm.prank(alice);
        uint256[] memory amounts = router.swapExactTokensForTokens(1e18, 0, path, bob, deadline);
        assertEq(amounts.length, 3);
        assertGt(amounts[2], 0);
        assertEq(amounts[2], quoted[2]);
        assertEq(tokenC.balanceOf(bob), amounts[2]);
        assertEq(tokenB.balanceOf(bob), 0);
        _assertRouterEmpty();
    }

    function test_SwapExactRevertsWhenOutputBelowMinimum() public {
        _seed(address(tokenA), address(tokenB), 100e18, 100e6);
        address[] memory path = _path2(address(tokenA), address(tokenB));
        uint256 expected = router.getAmountsOut(1e18, path)[1];
        uint256 deadline = _dl();

        vm.prank(alice);
        vm.expectRevert(Router.InsufficientOutputAmount.selector);
        router.swapExactTokensForTokens(1e18, expected + 1, path, bob, deadline);
    }

    function test_SwapForExactTokensSpendsOnlyWhatIsNeeded() public {
        _seed(address(tokenA), address(tokenB), 100e18, 100e6);
        address[] memory path = _path2(address(tokenA), address(tokenB));
        uint256 needed = router.getAmountsIn(500_000, path)[0];
        uint256 aBefore = tokenA.balanceOf(alice);
        uint256 deadline = _dl();

        vm.prank(alice);
        uint256[] memory amounts = router.swapTokensForExactTokens(500_000, needed, path, bob, deadline);
        assertEq(amounts[0], needed);
        assertEq(tokenB.balanceOf(bob), 500_000);
        assertEq(tokenA.balanceOf(alice), aBefore - needed);
        _assertRouterEmpty();
    }

    function test_SwapForExactRevertsWhenInputExceedsMaximum() public {
        _seed(address(tokenA), address(tokenB), 100e18, 100e6);
        address[] memory path = _path2(address(tokenA), address(tokenB));
        uint256 needed = router.getAmountsIn(500_000, path)[0];
        uint256 deadline = _dl();

        vm.prank(alice);
        vm.expectRevert(Router.ExcessiveInputAmount.selector);
        router.swapTokensForExactTokens(500_000, needed - 1, path, bob, deadline);
    }

    function test_SwapRevertsOnShortPath() public {
        address[] memory path = new address[](1);
        path[0] = address(tokenA);
        uint256 deadline = _dl();
        vm.prank(alice);
        vm.expectRevert(AmmLibrary.InvalidPath.selector);
        router.swapExactTokensForTokens(1e18, 0, path, bob, deadline);
    }

    function test_SwapRevertsWhenPairDoesNotExist() public {
        address[] memory path = _path2(address(tokenA), address(tokenC));
        uint256 deadline = _dl();
        vm.prank(alice);
        vm.expectRevert(AmmLibrary.PairNotFound.selector);
        router.swapExactTokensForTokens(1e18, 0, path, bob, deadline);
    }

    function test_SwapRevertsOnZeroRecipient() public {
        address[] memory path = _path2(address(tokenA), address(tokenB));
        uint256 deadline = _dl();
        vm.prank(alice);
        vm.expectRevert(Router.ZeroAddress.selector);
        router.swapExactTokensForTokens(1e18, 0, path, address(0), deadline);
    }

    function test_SwapRevertsAfterDeadline() public {
        address[] memory path = _path2(address(tokenA), address(tokenB));
        vm.warp(1000);
        vm.prank(alice);
        vm.expectRevert(Router.Expired.selector);
        router.swapExactTokensForTokens(1e18, 0, path, bob, 999);
    }

    function test_ConstructorRevertsOnZeroFactory() public {
        vm.expectRevert(Router.ZeroAddress.selector);
        new Router(address(0));
    }

    function test_ViewHelpersMatchLibrary() public view {
        assertEq(router.quote(1e18, 10e18, 20e18), 2e18);
        assertEq(router.getAmountOut(1000, 10000, 10000), 906);
        assertEq(router.getAmountIn(906, 10000, 10000), 1000);
    }
}

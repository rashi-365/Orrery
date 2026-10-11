// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Factory} from "../src/Factory.sol";
import {Pair} from "../src/Pair.sol";
import {Router} from "../src/Router.sol";
import {AmmLibrary} from "../src/libraries/AmmLibrary.sol";
import {TestToken} from "./mocks/TestToken.sol";
import {
    ReentrantToken,
    FalseReturnToken,
    NoReturnToken,
    FeeOnTransferToken
} from "./mocks/AttackTokens.sol";

interface IMintable {
    function mint(address to, uint256 amount) external;
}

/// Why this file exists: each test plays out one concrete way a pool could be attacked or
/// misused (hostile tokens, price games, dust, bad input) and pins down that the pool
/// either rejects it or the attacker does not profit. Note for maintainers: arguments
/// and helper values are always computed BEFORE vm.expectRevert / vm.prank, because those
/// cheatcodes attach to the very next external call, including view calls.
contract AttackTest is Test {
    Factory internal factory;
    Router internal router;
    address internal owner = makeAddr("owner");
    address internal alice = makeAddr("alice");
    address internal attacker = makeAddr("attacker");
    address internal victim = makeAddr("victim");

    function setUp() public {
        factory = new Factory(owner);
        router = new Router(address(factory));
    }

    // ---------------------------------------------------------------- helpers

    function _path(address x, address y) internal pure returns (address[] memory path) {
        path = new address[](2);
        path[0] = x;
        path[1] = y;
    }

    function _reentrancyError() internal pure returns (bytes memory) {
        return abi.encodeWithSignature("ReentrancyGuardReentrantCall()");
    }

    function _newPair(address x, address y) internal returns (Pair) {
        return Pair(factory.createPair(x, y));
    }

    /// @dev Direct (router-free) seeding, minting shares to alice.
    function _seed(Pair pair, uint256 a0, uint256 a1) internal {
        IMintable(pair.token0()).mint(address(pair), a0);
        IMintable(pair.token1()).mint(address(pair), a1);
        pair.mint(alice);
    }

    function _outs(Pair pair, address tokenOut, uint256 amount)
        internal
        view
        returns (uint256 amount0Out, uint256 amount1Out)
    {
        if (pair.token0() == tokenOut) {
            amount0Out = amount;
        } else {
            amount1Out = amount;
        }
    }

    function _addViaRouter(TestToken x, TestToken y, uint256 ax, uint256 ay) internal {
        x.mint(alice, ax);
        y.mint(alice, ay);
        uint256 deadline = block.timestamp + 1 hours;
        vm.startPrank(alice);
        x.approve(address(router), type(uint256).max);
        y.approve(address(router), type(uint256).max);
        router.addLiquidity(address(x), address(y), ax, ay, 0, 0, alice, deadline);
        vm.stopPrank();
    }

    function _fundAndApprove(address who, TestToken t, uint256 amount) internal {
        t.mint(who, amount);
        vm.prank(who);
        t.approve(address(router), type(uint256).max);
    }

    function _swapAs(address who, uint256 amountIn, uint256 minOut, address[] memory path)
        internal
        returns (uint256 out)
    {
        uint256 deadline = block.timestamp + 1 hours;
        vm.prank(who);
        uint256[] memory amounts =
            router.swapExactTokensForTokens(amountIn, minOut, path, who, deadline);
        out = amounts[amounts.length - 1];
    }

    function _plainPool() internal returns (TestToken a, TestToken b) {
        a = new TestToken("A", "A", 18);
        b = new TestToken("B", "B", 18);
        _addViaRouter(a, b, 1000e18, 1000e18);
    }

    function _freshPair() internal returns (Pair pair, TestToken t0, TestToken t1) {
        TestToken a = new TestToken("A", "A", 18);
        TestToken b = new TestToken("B", "B", 18);
        pair = _newPair(address(a), address(b));
        t0 = TestToken(pair.token0());
        t1 = TestToken(pair.token1());
    }

    function _mintDirect(
        Pair pair,
        TestToken t0,
        TestToken t1,
        uint256 amount0,
        uint256 amount1,
        address to
    ) internal returns (uint256) {
        t0.mint(address(pair), amount0);
        t1.mint(address(pair), amount1);
        return pair.mint(to);
    }

    function _burnAll(Pair pair, address who, uint256 shares)
        internal
        returns (uint256, uint256)
    {
        vm.prank(who);
        pair.transfer(address(pair), shares);
        return pair.burn(who);
    }

    function _reentrancyPool() internal returns (ReentrantToken bad, TestToken good, Pair pair) {
        bad = new ReentrantToken();
        good = new TestToken("Good", "G", 18);
        pair = _newPair(address(bad), address(good));
        _seed(pair, 100e18, 100e18);
    }

    function _fotPool() internal returns (FeeOnTransferToken fot, TestToken good, Pair pair) {
        fot = new FeeOnTransferToken();
        good = new TestToken("Good", "G", 18);
        pair = _newPair(address(fot), address(good));
        _seed(pair, 1000e18, 1000e18);
    }

    function _sandwichPool() internal returns (TestToken a, TestToken b) {
        (a, b) = _plainPool();
        _fundAndApprove(attacker, a, 200e18);
        _fundAndApprove(attacker, b, 0);
        _fundAndApprove(victim, a, 100e18);
    }

    function _oraclePool() internal returns (Pair pair, TestToken t0, TestToken t1) {
        (TestToken a, TestToken b) = _plainPool();
        pair = Pair(factory.getPair(address(a), address(b)));
        t0 = TestToken(pair.token0());
        t1 = TestToken(pair.token1());
        _fundAndApprove(attacker, t0, 4000e18);
        _fundAndApprove(attacker, t1, 0);
    }

    function _spotPrice0(Pair pair) internal view returns (uint256) {
        (uint112 r0, uint112 r1,) = pair.getReserves();
        return (uint256(r1) * 1e18) / r0;
    }

    function _assertAverageNearOne(uint256 cumulativeDelta, uint256 elapsed) internal pure {
        uint256 twap = cumulativeDelta / elapsed;
        uint256 one = 2 ** 112;
        assertGt(twap, (one * 98) / 100);
        assertLt(twap, (one * 101) / 100);
    }

    // ------------------------------------------- reentrancy via a hostile token

    function test_ReentrancyThroughTokenDuringSwapIsBlocked() public {
        bytes memory err = _reentrancyError();
        for (uint8 mode = 1; mode <= 5; mode++) {
            (ReentrantToken bad, TestToken good, Pair pair) = _reentrancyPool();
            bad.arm(address(pair), mode);
            good.mint(address(pair), 1e18);
            (uint256 out0, uint256 out1) = _outs(pair, address(bad), 9e17);
            vm.expectRevert(err);
            pair.swap(out0, out1, attacker);
        }
    }

    function test_ReentrancyThroughTokenDuringBurnIsBlocked() public {
        bytes memory err = _reentrancyError();
        for (uint8 mode = 1; mode <= 5; mode++) {
            (ReentrantToken bad,, Pair pair) = _reentrancyPool();
            bad.arm(address(pair), mode);
            uint256 shares = pair.balanceOf(alice);
            vm.prank(alice);
            pair.transfer(address(pair), shares);
            vm.expectRevert(err);
            pair.burn(alice);
        }
    }

    function test_ReentrancyThroughTokenDuringSkimIsBlocked() public {
        bytes memory err = _reentrancyError();
        for (uint8 mode = 1; mode <= 5; mode++) {
            (ReentrantToken bad,, Pair pair) = _reentrancyPool();
            bad.arm(address(pair), mode);
            vm.expectRevert(err);
            pair.skim(attacker);
        }
    }

    // ------------------------------------- tokens with unusual transfer behavior

    function test_FalseReturningTransferMakesBurnRevert() public {
        FalseReturnToken bad = new FalseReturnToken();
        TestToken good = new TestToken("Good", "G", 18);
        Pair pair = _newPair(address(bad), address(good));
        _seed(pair, 100e18, 100e18);
        bad.setFailTransfers(true);
        uint256 shares = pair.balanceOf(alice);
        vm.prank(alice);
        pair.transfer(address(pair), shares);
        bytes memory err = abi.encodeWithSignature("SafeERC20FailedOperation(address)", address(bad));
        vm.expectRevert(err);
        pair.burn(alice);
    }

    function test_FalseReturningTransferMakesSwapRevert() public {
        FalseReturnToken bad = new FalseReturnToken();
        TestToken good = new TestToken("Good", "G", 18);
        Pair pair = _newPair(address(bad), address(good));
        _seed(pair, 100e18, 100e18);
        bad.setFailTransfers(true);
        good.mint(address(pair), 1e18);
        (uint256 out0, uint256 out1) = _outs(pair, address(bad), 9e17);
        bytes memory err = abi.encodeWithSignature("SafeERC20FailedOperation(address)", address(bad));
        vm.expectRevert(err);
        pair.swap(out0, out1, attacker);
    }

    function test_TokenReturningNothingWorksThroughPairAndRouter() public {
        NoReturnToken nr = new NoReturnToken();
        TestToken good = new TestToken("Good", "G", 18);
        nr.mint(alice, 1_000e6);
        good.mint(alice, 1_000e18);
        uint256 deadline = block.timestamp + 1 hours;

        vm.startPrank(alice);
        nr.approve(address(router), type(uint256).max);
        good.approve(address(router), type(uint256).max);
        router.addLiquidity(address(nr), address(good), 100e6, 100e18, 0, 0, alice, deadline);
        vm.stopPrank();

        address[] memory path = _path(address(nr), address(good));
        uint256 quoted = router.getAmountsOut(10e6, path)[1];
        vm.prank(alice);
        router.swapExactTokensForTokens(10e6, 0, path, victim, deadline);
        assertEq(good.balanceOf(victim), quoted);

        Pair pair = Pair(factory.getPair(address(nr), address(good)));
        uint256 shares = pair.balanceOf(alice);
        uint256 nrBefore = nr.balanceOf(alice);
        vm.prank(alice);
        pair.approve(address(router), shares);
        vm.prank(alice);
        router.removeLiquidity(address(nr), address(good), shares, 0, 0, alice, deadline);
        assertGt(nr.balanceOf(alice), nrBefore);
    }

    // ------------------------------------------------------ fee-on-transfer token

    function test_FeeOnTransferInputCannotExtractNaiveOutput() public {
        (FeeOnTransferToken fot, TestToken good, Pair pair) = _fotPool();
        fot.mint(attacker, 100e18);
        vm.prank(attacker);
        fot.transfer(address(pair), 100e18); // the pair only receives 99e18
        uint256 naiveOut = router.getAmountOut(100e18, 1000e18, 1000e18);
        (uint256 out0, uint256 out1) = _outs(pair, address(good), naiveOut);
        vm.expectRevert(Pair.KInvariant.selector);
        pair.swap(out0, out1, attacker);
    }

    function test_FeeOnTransferInputOnlyBuysWhatWasActuallyReceived() public {
        (FeeOnTransferToken fot, TestToken good, Pair pair) = _fotPool();
        fot.mint(attacker, 100e18);
        vm.prank(attacker);
        fot.transfer(address(pair), 100e18);

        (uint112 r0, uint112 r1,) = pair.getReserves();
        uint256 kBefore = uint256(r0) * r1;
        uint256 honestOut = router.getAmountOut(99e18, 1000e18, 1000e18);
        (uint256 out0, uint256 out1) = _outs(pair, address(good), honestOut);
        pair.swap(out0, out1, attacker);

        (r0, r1,) = pair.getReserves();
        assertGe(uint256(r0) * r1, kBefore);
        assertEq(good.balanceOf(attacker), honestOut);
    }

    function test_RouterSwapWithFeeOnTransferInputReverts() public {
        (FeeOnTransferToken fot, TestToken good,) = _fotPool();
        fot.mint(attacker, 100e18);
        vm.prank(attacker);
        fot.approve(address(router), type(uint256).max);
        address[] memory path = _path(address(fot), address(good));
        uint256 deadline = block.timestamp + 1 hours;
        vm.prank(attacker);
        vm.expectRevert(Pair.KInvariant.selector);
        router.swapExactTokensForTokens(10e18, 0, path, attacker, deadline);
    }

    // ----------------------------------------- donation / share inflation attack

    function test_DonationInflationAttackDoesNotProfitAndDoesNotZeroVictim() public {
        (Pair pair, TestToken t0, TestToken t1) = _freshPair();

        // Attacker makes the smallest possible first deposit: 1001 wei of each token.
        uint256 attackerShares = _mintDirect(pair, t0, t1, 1001, 1001, attacker);
        assertEq(attackerShares, 1);

        // Attacker donates 1e18 of each token and syncs to inflate the share price.
        t0.mint(address(pair), 1e18);
        t1.mint(address(pair), 1e18);
        pair.sync();

        // Victim deposits 1e18 of each token and must still receive shares.
        uint256 victimShares = _mintDirect(pair, t0, t1, 1e18, 1e18, victim);
        assertGt(victimShares, 0);

        // Victim exits with at least 99.9% of the deposit.
        (uint256 v0, uint256 v1) = _burnAll(pair, victim, victimShares);
        assertGe(v0, 999e15);
        assertGe(v1, 999e15);

        // Attacker exits with far less than the 1e18 donated, so the attack loses money.
        (uint256 a0, uint256 a1) = _burnAll(pair, attacker, attackerShares);
        assertLt(a0, 1e18);
        assertLt(a1, 1e18);
    }

    // --------------------------------------------- 6 vs 18 decimal mismatch

    function test_DustTradeAgainstMixedDecimalPoolRevertsInsteadOfDonating() public {
        TestToken d18 = new TestToken("D18", "D18", 18);
        TestToken d6 = new TestToken("D6", "D6", 6);
        _addViaRouter(d18, d6, 1000e18, 1000e6);

        // One wei of the 18-decimal token is worth far less than one unit of the 6-decimal
        // token, so the output rounds to zero and the trade must revert, not donate funds.
        d18.mint(attacker, 1);
        vm.prank(attacker);
        d18.approve(address(router), type(uint256).max);
        address[] memory path = _path(address(d18), address(d6));
        uint256 deadline = block.timestamp + 1 hours;
        vm.prank(attacker);
        vm.expectRevert(Pair.InsufficientOutputAmount.selector);
        router.swapExactTokensForTokens(1, 0, path, attacker, deadline);
    }

    function test_MixedDecimalSwapPricesCorrectly() public {
        TestToken d18 = new TestToken("D18", "D18", 18);
        TestToken d6 = new TestToken("D6", "D6", 6);
        _addViaRouter(d18, d6, 1000e18, 1000e6);
        _fundAndApprove(attacker, d6, 10e6);
        address[] memory path = _path(address(d6), address(d18));

        uint256 quoted = router.getAmountsOut(10e6, path)[1];
        _swapAs(attacker, 10e6, 0, path);

        // 10 of the 6-decimal token is worth just under 10 of the 18-decimal token.
        assertGt(quoted, 98e17);
        assertLt(quoted, 10e18);
        assertEq(d18.balanceOf(attacker), quoted);
    }

    // ------------------------------------------------------------ zero amounts

    function test_RouterSwapOfZeroRevertsWithInsufficientInput() public {
        (TestToken a, TestToken b) = _plainPool();
        address[] memory path = _path(address(a), address(b));
        uint256 deadline = block.timestamp + 1 hours;
        vm.prank(attacker);
        vm.expectRevert(AmmLibrary.InsufficientInputAmount.selector);
        router.swapExactTokensForTokens(0, 0, path, attacker, deadline);
    }

    function test_RouterFirstDepositOfZeroReverts() public {
        TestToken a = new TestToken("A", "A", 18);
        TestToken b = new TestToken("B", "B", 18);
        uint256 deadline = block.timestamp + 1 hours;
        vm.prank(alice);
        vm.expectRevert(Pair.InsufficientLiquidityMinted.selector);
        router.addLiquidity(address(a), address(b), 0, 0, 0, 0, alice, deadline);
    }

    function test_RouterRemoveOfZeroSharesReverts() public {
        (TestToken a, TestToken b) = _plainPool();
        uint256 deadline = block.timestamp + 1 hours;
        vm.prank(alice);
        vm.expectRevert(Pair.InsufficientLiquidityBurned.selector);
        router.removeLiquidity(address(a), address(b), 0, 0, 0, alice, deadline);
    }

    function test_PairMintWithoutDepositReverts() public {
        (TestToken a, TestToken b) = _plainPool();
        Pair pair = Pair(factory.getPair(address(a), address(b)));
        vm.expectRevert(Pair.InsufficientLiquidityMinted.selector);
        pair.mint(alice);
    }

    // --------------------------------------------------------- same-token pair

    function test_SwapPathWithSameTokenReverts() public {
        (TestToken a,) = _plainPool();
        address[] memory path = _path(address(a), address(a));
        uint256 deadline = block.timestamp + 1 hours;
        vm.prank(attacker);
        vm.expectRevert(AmmLibrary.IdenticalAddresses.selector);
        router.swapExactTokensForTokens(1e18, 0, path, attacker, deadline);
    }

    // --------------------------------------------------------------- sandwiches

    function test_SandwichProfitsWhenVictimHasNoSlippageLimit() public {
        (TestToken a, TestToken b) = _sandwichPool();
        address[] memory fwd = _path(address(a), address(b));
        address[] memory back = _path(address(b), address(a));

        uint256 fairOut = router.getAmountsOut(100e18, fwd)[1];
        uint256 attackerStart = a.balanceOf(attacker);

        uint256 frontOut = _swapAs(attacker, 200e18, 0, fwd);
        uint256 victimOut = _swapAs(victim, 100e18, 0, fwd);
        _swapAs(attacker, frontOut, 0, back);

        assertLt(victimOut, fairOut);
        assertGt(a.balanceOf(attacker), attackerStart);
    }

    function test_SandwichIsBlockedWhenVictimSetsSlippageLimit() public {
        (TestToken a, TestToken b) = _sandwichPool();
        address[] memory fwd = _path(address(a), address(b));

        uint256 fairOut = router.getAmountsOut(100e18, fwd)[1];
        uint256 minOut = (fairOut * 995) / 1000;
        _swapAs(attacker, 200e18, 0, fwd);

        uint256 deadline = block.timestamp + 1 hours;
        uint256 victimBefore = a.balanceOf(victim);
        vm.prank(victim);
        vm.expectRevert(Router.InsufficientOutputAmount.selector);
        router.swapExactTokensForTokens(100e18, minOut, fwd, victim, deadline);
        assertEq(a.balanceOf(victim), victimBefore);
    }

    // ------------------------------------------------------ oracle manipulation

    function test_ShortLivedPriceSpikeBarelyMovesAOneHourAverage() public {
        (Pair pair, TestToken t0, TestToken t1) = _oraclePool();
        address[] memory up = _path(address(t0), address(t1));
        address[] memory down = _path(address(t1), address(t0));

        vm.warp(block.timestamp + 1 hours);
        pair.sync();
        uint256 cumStart = pair.price0CumulativeLast();
        uint256 timeStart = block.timestamp;

        // Spike: the spot price collapses, but the oracle has not recorded it yet because
        // no time has passed since the last update.
        uint256 got = _swapAs(attacker, 4000e18, 0, up);
        assertLt(_spotPrice0(pair), 1e17);

        // The spike lives for 12 seconds, then the attacker reverses it.
        vm.warp(block.timestamp + 12);
        _swapAs(attacker, got, 0, down);

        // Over the full hour the average barely moves, so only short-window readings of
        // this oracle are manipulable.
        vm.warp(timeStart + 1 hours);
        pair.sync();
        _assertAverageNearOne(pair.price0CumulativeLast() - cumStart, block.timestamp - timeStart);
    }
}

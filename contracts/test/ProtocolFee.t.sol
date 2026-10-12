// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {Factory} from "../src/Factory.sol";
import {Pair} from "../src/Pair.sol";
import {AmmLibrary} from "../src/libraries/AmmLibrary.sol";
import {TestToken} from "./mocks/TestToken.sol";

/// Why this file exists: the protocol fee mints extra shares to feeTo on every liquidity
/// event, which dilutes LPs, so the exact amount, the off-switch, and the "no growth means
/// no fee" case must each be pinned down. The factory owner is this test contract.
contract ProtocolFeeTest is Test {
    Factory internal factory;
    Pair internal pair;
    TestToken internal t0;
    TestToken internal t1;
    address internal alice = makeAddr("alice");
    address internal trader = makeAddr("trader");
    address internal feeRecipient = makeAddr("feeRecipient");

    function setUp() public {
        factory = new Factory(address(this));
        TestToken a = new TestToken("A", "A", 18);
        TestToken b = new TestToken("B", "B", 18);
        pair = Pair(factory.createPair(address(a), address(b)));
        t0 = TestToken(pair.token0());
        t1 = TestToken(pair.token1());
    }

    function _deposit(uint256 amount) internal returns (uint256) {
        t0.mint(address(pair), amount);
        t1.mint(address(pair), amount);
        return pair.mint(alice);
    }

    /// @dev One 100-token swap grows k by the 0.30% fee, which is what the protocol skims.
    function _tradeToAccrueFees() internal {
        (uint112 r0, uint112 r1,) = pair.getReserves();
        uint256 amountIn = 100e18;
        uint256 out = AmmLibrary.getAmountOut(amountIn, r0, r1);
        t0.mint(address(pair), amountIn);
        pair.swap(0, out, trader);
    }

    /// @dev Mirrors Pair._mintFee using the pair's current state (call before the next
    ///      liquidity event).
    function _expectedFeeShares() internal view returns (uint256) {
        (uint112 r0, uint112 r1,) = pair.getReserves();
        uint256 rootK = Math.sqrt(uint256(r0) * r1);
        uint256 rootKLast = Math.sqrt(pair.kLast());
        if (rootK <= rootKLast) return 0;
        return (pair.totalSupply() * (rootK - rootKLast)) / (rootK * 5 + rootKLast);
    }

    function test_FeeSharesMintedOnMintWhenFeeOn() public {
        factory.setFeeTo(feeRecipient);
        _deposit(1000e18);
        assertEq(pair.kLast(), uint256(1000e18) * 1000e18);
        assertEq(pair.balanceOf(feeRecipient), 0);

        _tradeToAccrueFees();
        uint256 expected = _expectedFeeShares();
        assertGt(expected, 0);

        _deposit(10e18);
        assertEq(pair.balanceOf(feeRecipient), expected);
        (uint112 r0, uint112 r1,) = pair.getReserves();
        assertEq(pair.kLast(), uint256(r0) * r1);
    }

    function test_FeeSharesMintedOnBurnWhenFeeOn() public {
        factory.setFeeTo(feeRecipient);
        uint256 shares = _deposit(1000e18);
        _tradeToAccrueFees();
        uint256 expected = _expectedFeeShares();
        assertGt(expected, 0);

        vm.prank(alice);
        pair.transfer(address(pair), shares / 2);
        pair.burn(alice);
        assertEq(pair.balanceOf(feeRecipient), expected);
    }

    function test_NoFeeSharesWhenFeeToUnset() public {
        _deposit(1000e18);
        _tradeToAccrueFees();
        _deposit(10e18);
        assertEq(pair.balanceOf(feeRecipient), 0);
        assertEq(pair.kLast(), 0);
    }

    function test_NoFeeSharesWithoutFeeGrowth() public {
        factory.setFeeTo(feeRecipient);
        _deposit(1000e18);
        _deposit(10e18);
        assertEq(pair.balanceOf(feeRecipient), 0);
        (uint112 r0, uint112 r1,) = pair.getReserves();
        assertEq(pair.kLast(), uint256(r0) * r1);
    }

    function test_TurningFeeOffClearsKLastOnNextLiquidityEvent() public {
        factory.setFeeTo(feeRecipient);
        _deposit(1000e18);
        assertGt(pair.kLast(), 0);

        factory.setFeeTo(address(0));
        _deposit(10e18);
        assertEq(pair.kLast(), 0);
    }

    function test_FeeRecipientCanRedeemItsShares() public {
        factory.setFeeTo(feeRecipient);
        _deposit(1000e18);
        _tradeToAccrueFees();
        _deposit(10e18);

        uint256 feeShares = pair.balanceOf(feeRecipient);
        assertGt(feeShares, 0);
        vm.prank(feeRecipient);
        pair.transfer(address(pair), feeShares);
        (uint256 a0, uint256 a1) = pair.burn(feeRecipient);
        assertGt(a0, 0);
        assertGt(a1, 0);
        assertEq(t0.balanceOf(feeRecipient), a0);
        assertEq(t1.balanceOf(feeRecipient), a1);
    }
}

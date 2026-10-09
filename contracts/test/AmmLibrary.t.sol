// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {AmmLibrary} from "../src/libraries/AmmLibrary.sol";
import {LibraryHarness} from "./mocks/LibraryHarness.sol";

/// Why this file exists: every swap and deposit amount in the app comes from this math,
/// so known values and every input-validation revert are pinned down exactly.
contract AmmLibraryTest is Test {
    LibraryHarness internal lib;
    address internal tokenLow = address(0x1000);
    address internal tokenHigh = address(0x2000);

    function setUp() public {
        lib = new LibraryHarness();
    }

    function test_SortTokensOrdersAddresses() public view {
        (address a, address b) = lib.sortTokens(tokenHigh, tokenLow);
        assertEq(a, tokenLow);
        assertEq(b, tokenHigh);
    }

    function test_SortTokensRevertsOnIdentical() public {
        vm.expectRevert(AmmLibrary.IdenticalAddresses.selector);
        lib.sortTokens(tokenLow, tokenLow);
    }

    function test_SortTokensRevertsOnZeroAddress() public {
        vm.expectRevert(AmmLibrary.ZeroAddress.selector);
        lib.sortTokens(address(0), tokenLow);
    }

    function test_QuoteScalesByReserveRatio() public view {
        assertEq(lib.quote(1e18, 10e18, 20e18), 2e18);
    }

    function test_QuoteRevertsOnZeroAmount() public {
        vm.expectRevert(AmmLibrary.InsufficientAmount.selector);
        lib.quote(0, 10, 10);
    }

    function test_QuoteRevertsOnZeroReserves() public {
        vm.expectRevert(AmmLibrary.InsufficientLiquidity.selector);
        lib.quote(1, 0, 10);
    }

    function test_GetAmountOutMatchesHandComputedValue() public view {
        // 1000 in against 10000/10000: 997000 * 10000 / (10000 * 1000 + 997000) = 906.
        assertEq(lib.getAmountOut(1000, 10000, 10000), 906);
    }

    function test_GetAmountOutRevertsOnZeroInput() public {
        vm.expectRevert(AmmLibrary.InsufficientInputAmount.selector);
        lib.getAmountOut(0, 10000, 10000);
    }

    function test_GetAmountOutRevertsOnZeroReserves() public {
        vm.expectRevert(AmmLibrary.InsufficientLiquidity.selector);
        lib.getAmountOut(1000, 0, 10000);
    }

    function test_GetAmountInMatchesHandComputedValue() public view {
        // 10000 * 906 * 1000 / ((10000 - 906) * 997) = 999, rounded up by one to 1000.
        assertEq(lib.getAmountIn(906, 10000, 10000), 1000);
    }

    function test_GetAmountInRevertsOnZeroOutput() public {
        vm.expectRevert(AmmLibrary.InsufficientOutputAmount.selector);
        lib.getAmountIn(0, 10000, 10000);
    }

    function test_GetAmountInRevertsWhenOutputDrainsReserve() public {
        vm.expectRevert(AmmLibrary.InsufficientLiquidity.selector);
        lib.getAmountIn(10000, 10000, 10000);
    }

    function test_GetAmountInRevertsOnZeroReserves() public {
        vm.expectRevert(AmmLibrary.InsufficientLiquidity.selector);
        lib.getAmountIn(1, 10000, 0);
    }

    function test_GetAmountsOutRevertsOnShortPath() public {
        address[] memory path = new address[](1);
        path[0] = tokenLow;
        vm.expectRevert(AmmLibrary.InvalidPath.selector);
        lib.getAmountsOut(address(0), 1, path);
    }

    function test_GetAmountsInRevertsOnShortPath() public {
        address[] memory path = new address[](1);
        path[0] = tokenLow;
        vm.expectRevert(AmmLibrary.InvalidPath.selector);
        lib.getAmountsIn(address(0), 1, path);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AmmLibrary} from "../../src/libraries/AmmLibrary.sol";

/// @dev Test-only wrapper so internal library reverts can be asserted from tests.
contract LibraryHarness {
    function sortTokens(address a, address b) external pure returns (address, address) {
        return AmmLibrary.sortTokens(a, b);
    }

    function quote(uint256 a, uint256 rA, uint256 rB) external pure returns (uint256) {
        return AmmLibrary.quote(a, rA, rB);
    }

    function getAmountOut(uint256 a, uint256 rIn, uint256 rOut) external pure returns (uint256) {
        return AmmLibrary.getAmountOut(a, rIn, rOut);
    }

    function getAmountIn(uint256 a, uint256 rIn, uint256 rOut) external pure returns (uint256) {
        return AmmLibrary.getAmountIn(a, rIn, rOut);
    }

    function getAmountsOut(address factory, uint256 a, address[] memory path)
        external
        view
        returns (uint256[] memory)
    {
        return AmmLibrary.getAmountsOut(factory, a, path);
    }

    function getAmountsIn(address factory, uint256 a, address[] memory path)
        external
        view
        returns (uint256[] memory)
    {
        return AmmLibrary.getAmountsIn(factory, a, path);
    }
}

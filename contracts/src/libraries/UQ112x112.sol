// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title UQ112x112
/// @notice Fixed-point helpers for the cumulative price oracle. A UQ112x112
///         number has 112 integer bits and 112 fractional bits, stored in a uint224.
library UQ112x112 {
    uint224 internal constant Q112 = 2 ** 112;

    /// @notice Encodes a uint112 as a UQ112x112.
    /// @dev Cannot overflow: y < 2^112, so y * 2^112 < 2^224.
    function encode(uint112 y) internal pure returns (uint224) {
        return uint224(y) * Q112;
    }

    /// @notice Divides a UQ112x112 by a uint112, returning a UQ112x112.
    /// @dev Reverts on division by zero. Callers guarantee y != 0.
    function uqdiv(uint224 x, uint112 y) internal pure returns (uint224) {
        return x / uint224(y);
    }
}

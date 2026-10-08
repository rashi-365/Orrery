// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IFactory
/// @notice Minimal factory surface that pairs and (later) the router depend on.
interface IFactory {
    /// @notice Address that receives the protocol share of fees, or zero if disabled.
    function feeTo() external view returns (address);

    /// @notice Returns the pair for two tokens in either order, or zero if none exists.
    function getPair(address tokenA, address tokenB) external view returns (address pair);

    /// @notice Returns the pair at a given index.
    function allPairs(uint256 index) external view returns (address pair);

    /// @notice Total number of pairs created.
    function allPairsLength() external view returns (uint256);

    /// @notice Creates a pair for two tokens.
    function createPair(address tokenA, address tokenB) external returns (address pair);
}

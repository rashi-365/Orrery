// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IPair
/// @notice The subset of the Pair surface that the router and library call.
interface IPair {
    /// @notice First token of the pair (lower address).
    function token0() external view returns (address);

    /// @notice Second token of the pair (higher address).
    function token1() external view returns (address);

    /// @notice Current reserves and last update timestamp.
    function getReserves()
        external
        view
        returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);

    /// @notice Mints shares for tokens already transferred into the pair.
    function mint(address to) external returns (uint256 liquidity);

    /// @notice Burns shares already transferred into the pair.
    function burn(address to) external returns (uint256 amount0, uint256 amount1);

    /// @notice Swaps tokens; input must already have been transferred in.
    function swap(uint256 amount0Out, uint256 amount1Out, address to) external;
}

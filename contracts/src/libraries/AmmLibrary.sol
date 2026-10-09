// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IFactory} from "../interfaces/IFactory.sol";
import {IPair} from "../interfaces/IPair.sol";

/// @title AmmLibrary
/// @notice Pure pricing math and pair lookups shared by the router and the front end.
/// @dev All amounts are raw token units. The 0.30% fee is expressed as 997/1000 to match
///      the Pair's invariant check exactly. Rounding always favors the pool: outputs
///      round down, required inputs round up (the "+ 1" in getAmountIn).
library AmmLibrary {
    uint256 internal constant FEE_NUMERATOR = 997;
    uint256 internal constant FEE_DENOMINATOR = 1000;

    error IdenticalAddresses();
    error ZeroAddress();
    error PairNotFound();
    error InsufficientAmount();
    error InsufficientInputAmount();
    error InsufficientOutputAmount();
    error InsufficientLiquidity();
    error InvalidPath();

    /// @notice Orders two token addresses and rejects invalid input.
    /// @param tokenA First token.
    /// @param tokenB Second token.
    /// @return token0 The lower address.
    /// @return token1 The higher address.
    function sortTokens(address tokenA, address tokenB)
        internal
        pure
        returns (address token0, address token1)
    {
        if (tokenA == tokenB) revert IdenticalAddresses();
        (token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        if (token0 == address(0)) revert ZeroAddress();
    }

    /// @notice Looks up the pair for two tokens and reverts if it does not exist.
    /// @param factory Factory address.
    /// @param tokenA First token.
    /// @param tokenB Second token.
    /// @return pair The pair address.
    function pairFor(address factory, address tokenA, address tokenB)
        internal
        view
        returns (address pair)
    {
        (address token0, address token1) = sortTokens(tokenA, tokenB);
        pair = IFactory(factory).getPair(token0, token1);
        if (pair == address(0)) revert PairNotFound();
    }

    /// @notice Returns the reserves of a pair, ordered to match the arguments.
    /// @param factory Factory address.
    /// @param tokenA First token.
    /// @param tokenB Second token.
    /// @return reserveA Reserve of tokenA.
    /// @return reserveB Reserve of tokenB.
    function getReserves(address factory, address tokenA, address tokenB)
        internal
        view
        returns (uint256 reserveA, uint256 reserveB)
    {
        (address token0,) = sortTokens(tokenA, tokenB);
        address pair = pairFor(factory, tokenA, tokenB);
        (uint112 reserve0, uint112 reserve1,) = IPair(pair).getReserves();
        (reserveA, reserveB) = tokenA == token0 ? (reserve0, reserve1) : (reserve1, reserve0);
    }

    /// @notice Given an amount of one asset, the equivalent amount of the other at the
    ///         current reserve ratio. Used for proportional liquidity deposits.
    /// @param amountA Amount of asset A.
    /// @param reserveA Reserve of asset A.
    /// @param reserveB Reserve of asset B.
    /// @return amountB Equivalent amount of asset B, rounded down.
    function quote(uint256 amountA, uint256 reserveA, uint256 reserveB)
        internal
        pure
        returns (uint256 amountB)
    {
        if (amountA == 0) revert InsufficientAmount();
        if (reserveA == 0 || reserveB == 0) revert InsufficientLiquidity();
        amountB = (amountA * reserveB) / reserveA;
    }

    /// @notice Output received for an exact input, after the 0.30% fee.
    /// @param amountIn Exact input amount.
    /// @param reserveIn Reserve of the input token.
    /// @param reserveOut Reserve of the output token.
    /// @return amountOut Output amount, rounded down.
    function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut)
        internal
        pure
        returns (uint256 amountOut)
    {
        if (amountIn == 0) revert InsufficientInputAmount();
        if (reserveIn == 0 || reserveOut == 0) revert InsufficientLiquidity();
        uint256 amountInWithFee = amountIn * FEE_NUMERATOR;
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = reserveIn * FEE_DENOMINATOR + amountInWithFee;
        amountOut = numerator / denominator;
    }

    /// @notice Input required for an exact output, after the 0.30% fee.
    /// @param amountOut Exact output amount.
    /// @param reserveIn Reserve of the input token.
    /// @param reserveOut Reserve of the output token.
    /// @return amountIn Required input, rounded up.
    function getAmountIn(uint256 amountOut, uint256 reserveIn, uint256 reserveOut)
        internal
        pure
        returns (uint256 amountIn)
    {
        if (amountOut == 0) revert InsufficientOutputAmount();
        if (reserveIn == 0 || reserveOut == 0) revert InsufficientLiquidity();
        if (amountOut >= reserveOut) revert InsufficientLiquidity();
        uint256 numerator = reserveIn * amountOut * FEE_DENOMINATOR;
        uint256 denominator = (reserveOut - amountOut) * FEE_NUMERATOR;
        amountIn = numerator / denominator + 1;
    }

    /// @notice Chained getAmountOut along a path of tokens.
    /// @param factory Factory address.
    /// @param amountIn Exact input for the first hop.
    /// @param path Token addresses, at least two.
    /// @return amounts Amount at each position of the path; amounts[0] is amountIn.
    function getAmountsOut(address factory, uint256 amountIn, address[] memory path)
        internal
        view
        returns (uint256[] memory amounts)
    {
        if (path.length < 2) revert InvalidPath();
        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        for (uint256 i; i < path.length - 1; i++) {
            (uint256 reserveIn, uint256 reserveOut) = getReserves(factory, path[i], path[i + 1]);
            amounts[i + 1] = getAmountOut(amounts[i], reserveIn, reserveOut);
        }
    }

    /// @notice Chained getAmountIn along a path of tokens, computed backwards.
    /// @param factory Factory address.
    /// @param amountOut Exact output of the last hop.
    /// @param path Token addresses, at least two.
    /// @return amounts Amount at each position of the path; the last is amountOut.
    function getAmountsIn(address factory, uint256 amountOut, address[] memory path)
        internal
        view
        returns (uint256[] memory amounts)
    {
        if (path.length < 2) revert InvalidPath();
        amounts = new uint256[](path.length);
        amounts[amounts.length - 1] = amountOut;
        for (uint256 i = path.length - 1; i > 0; i--) {
            (uint256 reserveIn, uint256 reserveOut) = getReserves(factory, path[i - 1], path[i]);
            amounts[i - 1] = getAmountIn(amounts[i], reserveIn, reserveOut);
        }
    }
}

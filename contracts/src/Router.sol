// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IFactory} from "./interfaces/IFactory.sol";
import {IPair} from "./interfaces/IPair.sol";
import {AmmLibrary} from "./libraries/AmmLibrary.sol";

/// @title Router
/// @notice User-facing entry point for adding and removing liquidity and swapping.
/// @dev Stateless apart from the immutable factory address, so it needs no reentrancy
///      guard and cannot hold user funds: tokens move straight from the caller to the
///      pair, and liquidity shares move straight from the caller to the pair on removal.
///      Every state-changing function takes a deadline and slippage bounds.
///      Known limitations: standard ERC20 tokens only (no fee-on-transfer or rebasing
///      support), no native ETH, no permit.
contract Router {
    using SafeERC20 for IERC20;

    /// @notice Factory whose pairs this router operates on.
    address public immutable factory;

    error Expired();
    error ZeroAddress();
    error InsufficientAAmount();
    error InsufficientBAmount();
    error InsufficientOutputAmount();
    error ExcessiveInputAmount();

    modifier ensure(uint256 deadline) {
        if (deadline < block.timestamp) revert Expired();
        _;
    }

    /// @param factory_ Factory address. Must not be zero.
    constructor(address factory_) {
        if (factory_ == address(0)) revert ZeroAddress();
        factory = factory_;
    }

    /// @notice Adds liquidity to a pair, creating the pair if it does not exist.
    /// @dev Deposits at the current ratio, using at most the desired amounts. Reverts if
    ///      the ratio-matched amount falls below the minimums. The first deposit into an
    ///      empty pair sets the price, so there are no minimums to protect there.
    /// @param tokenA First token.
    /// @param tokenB Second token.
    /// @param amountADesired Most of tokenA to deposit.
    /// @param amountBDesired Most of tokenB to deposit.
    /// @param amountAMin Least of tokenA to deposit.
    /// @param amountBMin Least of tokenB to deposit.
    /// @param to Recipient of the liquidity shares.
    /// @param deadline Latest block timestamp at which the call is valid.
    /// @return amountA Amount of tokenA deposited.
    /// @return amountB Amount of tokenB deposited.
    /// @return liquidity Shares minted.
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256 amountA, uint256 amountB, uint256 liquidity) {
        if (to == address(0)) revert ZeroAddress();
        (amountA, amountB) =
            _addLiquidity(tokenA, tokenB, amountADesired, amountBDesired, amountAMin, amountBMin);
        liquidity = _deposit(tokenA, tokenB, amountA, amountB, to);
    }

    /// @notice Removes liquidity and sends both tokens to `to`.
    /// @dev The caller must have approved this router for `liquidity` shares.
    /// @param tokenA First token.
    /// @param tokenB Second token.
    /// @param liquidity Shares to burn.
    /// @param amountAMin Least of tokenA to receive.
    /// @param amountBMin Least of tokenB to receive.
    /// @param to Recipient of the tokens.
    /// @param deadline Latest block timestamp at which the call is valid.
    /// @return amountA Amount of tokenA received.
    /// @return amountB Amount of tokenB received.
    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256 amountA, uint256 amountB) {
        if (to == address(0)) revert ZeroAddress();
        (amountA, amountB) = _withdraw(tokenA, tokenB, liquidity, to);
        if (amountA < amountAMin) revert InsufficientAAmount();
        if (amountB < amountBMin) revert InsufficientBAmount();
    }

    /// @notice Swaps an exact input amount for as much output as possible.
    /// @param amountIn Exact amount of path[0] to spend.
    /// @param amountOutMin Least amount of the last token to receive.
    /// @param path Token addresses, at least two; each adjacent pair must have a pool.
    /// @param to Recipient of the output.
    /// @param deadline Latest block timestamp at which the call is valid.
    /// @return amounts Amounts along the path; the last is the output.
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256[] memory amounts) {
        if (to == address(0)) revert ZeroAddress();
        amounts = AmmLibrary.getAmountsOut(factory, amountIn, path);
        if (amounts[amounts.length - 1] < amountOutMin) revert InsufficientOutputAmount();
        IERC20(path[0]).safeTransferFrom(
            msg.sender, AmmLibrary.pairFor(factory, path[0], path[1]), amounts[0]
        );
        _swap(amounts, path, to);
    }

    /// @notice Swaps as little input as needed for an exact output amount.
    /// @param amountOut Exact amount of the last token to receive.
    /// @param amountInMax Most of path[0] the caller is willing to spend.
    /// @param path Token addresses, at least two; each adjacent pair must have a pool.
    /// @param to Recipient of the output.
    /// @param deadline Latest block timestamp at which the call is valid.
    /// @return amounts Amounts along the path; the first is the input spent.
    function swapTokensForExactTokens(
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256[] memory amounts) {
        if (to == address(0)) revert ZeroAddress();
        amounts = AmmLibrary.getAmountsIn(factory, amountOut, path);
        if (amounts[0] > amountInMax) revert ExcessiveInputAmount();
        IERC20(path[0]).safeTransferFrom(
            msg.sender, AmmLibrary.pairFor(factory, path[0], path[1]), amounts[0]
        );
        _swap(amounts, path, to);
    }

    /// @notice See AmmLibrary.quote.
    /// @param amountA Amount of asset A.
    /// @param reserveA Reserve of asset A.
    /// @param reserveB Reserve of asset B.
    /// @return amountB Equivalent amount of asset B.
    function quote(uint256 amountA, uint256 reserveA, uint256 reserveB)
        external
        pure
        returns (uint256 amountB)
    {
        return AmmLibrary.quote(amountA, reserveA, reserveB);
    }

    /// @notice See AmmLibrary.getAmountOut.
    /// @param amountIn Exact input amount.
    /// @param reserveIn Reserve of the input token.
    /// @param reserveOut Reserve of the output token.
    /// @return amountOut Output amount.
    function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut)
        external
        pure
        returns (uint256 amountOut)
    {
        return AmmLibrary.getAmountOut(amountIn, reserveIn, reserveOut);
    }

    /// @notice See AmmLibrary.getAmountIn.
    /// @param amountOut Exact output amount.
    /// @param reserveIn Reserve of the input token.
    /// @param reserveOut Reserve of the output token.
    /// @return amountIn Required input amount.
    function getAmountIn(uint256 amountOut, uint256 reserveIn, uint256 reserveOut)
        external
        pure
        returns (uint256 amountIn)
    {
        return AmmLibrary.getAmountIn(amountOut, reserveIn, reserveOut);
    }

    /// @notice Quotes outputs along a path for an exact input.
    /// @param amountIn Exact input for the first hop.
    /// @param path Token addresses, at least two.
    /// @return amounts Amount at each position of the path.
    function getAmountsOut(uint256 amountIn, address[] calldata path)
        external
        view
        returns (uint256[] memory amounts)
    {
        return AmmLibrary.getAmountsOut(factory, amountIn, path);
    }

    /// @notice Quotes inputs along a path for an exact output.
    /// @param amountOut Exact output of the last hop.
    /// @param path Token addresses, at least two.
    /// @return amounts Amount at each position of the path.
    function getAmountsIn(uint256 amountOut, address[] calldata path)
        external
        view
        returns (uint256[] memory amounts)
    {
        return AmmLibrary.getAmountsIn(factory, amountOut, path);
    }

    /// @dev Moves both tokens from the caller into the pair and mints shares to `to`.
    ///      Split out of addLiquidity to keep its stack usage low.
    function _deposit(address tokenA, address tokenB, uint256 amountA, uint256 amountB, address to)
        private
        returns (uint256 liquidity)
    {
        address pair = AmmLibrary.pairFor(factory, tokenA, tokenB);
        IERC20(tokenA).safeTransferFrom(msg.sender, pair, amountA);
        IERC20(tokenB).safeTransferFrom(msg.sender, pair, amountB);
        liquidity = IPair(pair).mint(to);
    }

    // slither-disable-start unused-return
    /// @dev Moves shares from the caller into the pair, burns them, and orders the
    ///      result to match (tokenA, tokenB). Split out of removeLiquidity for stack depth.
    function _withdraw(address tokenA, address tokenB, uint256 liquidity, address to)
        private
        returns (uint256 amountA, uint256 amountB)
    {
        address pair = AmmLibrary.pairFor(factory, tokenA, tokenB);
        IERC20(pair).safeTransferFrom(msg.sender, pair, liquidity);
        (uint256 amount0, uint256 amount1) = IPair(pair).burn(to);
        (address token0,) = AmmLibrary.sortTokens(tokenA, tokenB);
        (amountA, amountB) = tokenA == token0 ? (amount0, amount1) : (amount1, amount0);
    }
    // slither-disable-end unused-return

    // slither-disable-start unused-return
    /// @dev Picks the ratio-matched deposit amounts, creating the pair if needed.
    function _addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin
    ) private returns (uint256 amountA, uint256 amountB) {
        if (IFactory(factory).getPair(tokenA, tokenB) == address(0)) {
            IFactory(factory).createPair(tokenA, tokenB);
        }
        (uint256 reserveA, uint256 reserveB) = AmmLibrary.getReserves(factory, tokenA, tokenB);
        if (reserveA == 0 && reserveB == 0) {
            (amountA, amountB) = (amountADesired, amountBDesired);
        } else {
            uint256 amountBOptimal = AmmLibrary.quote(amountADesired, reserveA, reserveB);
            if (amountBOptimal <= amountBDesired) {
                if (amountBOptimal < amountBMin) revert InsufficientBAmount();
                (amountA, amountB) = (amountADesired, amountBOptimal);
            } else {
                // Rounding guarantees amountAOptimal <= amountADesired here: if
                // floor(aDes * rB / rA) > bDes then aDes > bDes * rA / rB >= amountAOptimal.
                uint256 amountAOptimal = AmmLibrary.quote(amountBDesired, reserveB, reserveA);
                if (amountAOptimal < amountAMin) revert InsufficientAAmount();
                (amountA, amountB) = (amountAOptimal, amountBDesired);
            }
        }
    }
    // slither-disable-end unused-return

    // slither-disable-start unused-return
    // slither-disable-start calls-loop
    /// @dev Executes the hops. Intermediate outputs go straight to the next pair, and
    ///      the first hop's input was already sent to its pair by the caller of this.
    function _swap(uint256[] memory amounts, address[] calldata path, address to_) private {
        for (uint256 i; i < path.length - 1; i++) {
            (address input, address output) = (path[i], path[i + 1]);
            (address token0,) = AmmLibrary.sortTokens(input, output);
            uint256 amountOut = amounts[i + 1];
            (uint256 amount0Out, uint256 amount1Out) =
                input == token0 ? (uint256(0), amountOut) : (amountOut, uint256(0));
            address to = i < path.length - 2
                ? AmmLibrary.pairFor(factory, output, path[i + 2])
                : to_;
            IPair(AmmLibrary.pairFor(factory, input, output)).swap(amount0Out, amount1Out, to);
        }
    }
    // slither-disable-end calls-loop
    // slither-disable-end unused-return
}

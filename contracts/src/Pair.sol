// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IFactory} from "./interfaces/IFactory.sol";
import {UQ112x112} from "./libraries/UQ112x112.sol";

/// @title Pair
/// @notice Constant-product (x * y = k) liquidity pool for two ERC20 tokens with a
///         0.30% swap fee. The pool's liquidity shares are this contract's own ERC20.
/// @dev Design notes:
///      - No flash swaps: swap() has no callback. Input tokens must already be in the
///        pair when swap() is called (the router does this).
///      - Reserves are uint112 so both fit in one storage slot with a uint32 timestamp.
///      - mint, burn, swap, skim and sync are all nonReentrant. Because external token
///        calls happen before reserves are updated (balances are re-read afterwards, as
///        in Uniswap V2), the lock is what makes that ordering safe.
///      - The cumulative price oracle can be manipulated within a single block and must
///        not be read as a spot price by integrators. Use time-weighted averages over
///        a window long enough to make manipulation expensive.
contract Pair is ERC20, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Shares permanently locked on the first mint. Defends against the
    ///         first-depositor share-inflation attack by making the smallest possible
    ///         share unit worth a non-trivial amount of the pool.
    uint256 public constant MINIMUM_LIQUIDITY = 1000;

    /// @notice Burn address that holds the permanently locked shares. OpenZeppelin 5
    ///         forbids minting to address(0), so a dead address is used instead.
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    /// @notice Factory that deployed this pair.
    address public immutable factory;

    /// @notice First token of the pair (lower address).
    address public token0;

    /// @notice Second token of the pair (higher address).
    address public token1;

    // Packed into one 256-bit slot: 112 + 112 + 32.
    uint112 private reserve0;
    uint112 private reserve1;
    uint32 private blockTimestampLast;

    /// @notice Cumulative price of token0 in token1 terms, UQ112x112 seconds.
    uint256 public price0CumulativeLast;

    /// @notice Cumulative price of token1 in token0 terms, UQ112x112 seconds.
    uint256 public price1CumulativeLast;

    /// @notice reserve0 * reserve1 as of the most recent liquidity event. Only
    ///         maintained while the protocol fee is on.
    uint256 public kLast;

    error Forbidden();
    error AlreadyInitialized();
    error Overflow();
    error InsufficientLiquidityMinted();
    error InsufficientLiquidityBurned();
    error InsufficientOutputAmount();
    error InsufficientInputAmount();
    error InsufficientLiquidity();
    error InvalidTo();
    error KInvariant();

    event Mint(address indexed sender, uint256 amount0, uint256 amount1);
    event Burn(address indexed sender, uint256 amount0, uint256 amount1, address indexed to);
    event Swap(
        address indexed sender,
        uint256 amount0In,
        uint256 amount1In,
        uint256 amount0Out,
        uint256 amount1Out,
        address indexed to
    );
    event Sync(uint112 reserve0, uint112 reserve1);

    /// @dev Takes no constructor arguments so the creation code hash is constant,
    ///      which lets the library compute pair addresses off-chain and on-chain.
    constructor() ERC20("Liquidity Token", "LPT") {
        factory = msg.sender;
    }

    // slither-disable-start missing-zero-check
    /// @notice Sets the token pair. Callable once, by the factory only.
    /// @param initToken0 The lower-addressed token.
    /// @param initToken1 The higher-addressed token.
    function initialize(address initToken0, address initToken1) external {
        if (msg.sender != factory) revert Forbidden();
        if (token0 != address(0)) revert AlreadyInitialized();
        token0 = initToken0;
        token1 = initToken1;
    }
    // slither-disable-end missing-zero-check

    /// @notice Current reserves and the timestamp of the last update.
    /// @return _reserve0 Reserve of token0.
    /// @return _reserve1 Reserve of token1.
    /// @return _blockTimestampLast Block timestamp (mod 2^32) of the last update.
    function getReserves()
        public
        view
        returns (uint112 _reserve0, uint112 _reserve1, uint32 _blockTimestampLast)
    {
        _reserve0 = reserve0;
        _reserve1 = reserve1;
        _blockTimestampLast = blockTimestampLast;
    }

    // slither-disable-start incorrect-equality
    // slither-disable-start timestamp
    /// @notice Mints shares for tokens that were transferred into the pair beforehand.
    /// @dev Reverts via checked arithmetic if a balance is below its reserve
    ///      (for example a token that burns balances), which is the safe outcome.
    /// @param to Recipient of the new shares.
    /// @return liquidity Shares minted.
    function mint(address to) external nonReentrant returns (uint256 liquidity) {
        (uint112 _reserve0, uint112 _reserve1,) = getReserves();
        uint256 balance0 = IERC20(token0).balanceOf(address(this));
        uint256 balance1 = IERC20(token1).balanceOf(address(this));
        uint256 amount0 = balance0 - _reserve0;
        uint256 amount1 = balance1 - _reserve1;

        bool feeOn = _mintFee(_reserve0, _reserve1);
        uint256 _totalSupply = totalSupply();
        if (_totalSupply == 0) {
            uint256 root = Math.sqrt(amount0 * amount1);
            if (root <= MINIMUM_LIQUIDITY) revert InsufficientLiquidityMinted();
            liquidity = root - MINIMUM_LIQUIDITY;
            _mint(DEAD, MINIMUM_LIQUIDITY);
        } else {
            // Rounds down and takes the smaller side, so a depositor can never receive
            // more value than they contributed. Imbalanced deposits donate the excess.
            liquidity = Math.min(
                (amount0 * _totalSupply) / _reserve0, (amount1 * _totalSupply) / _reserve1
            );
        }
        if (liquidity == 0) revert InsufficientLiquidityMinted();
        _mint(to, liquidity);

        _update(balance0, balance1, _reserve0, _reserve1);
        if (feeOn) kLast = uint256(reserve0) * reserve1;
        emit Mint(msg.sender, amount0, amount1);
    }
    // slither-disable-end timestamp
    // slither-disable-end incorrect-equality

    // slither-disable-start incorrect-equality
    // slither-disable-start reentrancy-no-eth
    // slither-disable-start reentrancy-benign
    // slither-disable-start timestamp
    /// @notice Burns shares that were transferred into the pair beforehand and pays
    ///         out the proportional share of both tokens.
    /// @param to Recipient of the tokens.
    /// @return amount0 Amount of token0 paid out.
    /// @return amount1 Amount of token1 paid out.
    function burn(address to) external nonReentrant returns (uint256 amount0, uint256 amount1) {
        (uint112 _reserve0, uint112 _reserve1,) = getReserves();
        uint256 balance0 = IERC20(token0).balanceOf(address(this));
        uint256 balance1 = IERC20(token1).balanceOf(address(this));
        uint256 liquidity = balanceOf(address(this));

        bool feeOn = _mintFee(_reserve0, _reserve1);
        uint256 _totalSupply = totalSupply();
        // Rounds down, so the pool keeps any dust.
        amount0 = (liquidity * balance0) / _totalSupply;
        amount1 = (liquidity * balance1) / _totalSupply;
        if (amount0 == 0 || amount1 == 0) revert InsufficientLiquidityBurned();

        _burn(address(this), liquidity);
        IERC20(token0).safeTransfer(to, amount0);
        IERC20(token1).safeTransfer(to, amount1);

        // Balances are re-read after the transfers so reserves match reality even for
        // tokens that take a cut on transfer. Safe because the function is nonReentrant.
        balance0 = IERC20(token0).balanceOf(address(this));
        balance1 = IERC20(token1).balanceOf(address(this));

        _update(balance0, balance1, _reserve0, _reserve1);
        if (feeOn) kLast = uint256(reserve0) * reserve1;
        emit Burn(msg.sender, amount0, amount1, to);
    }
    // slither-disable-end timestamp
    // slither-disable-end reentrancy-benign
    // slither-disable-end reentrancy-no-eth
    // slither-disable-end incorrect-equality

    // slither-disable-start incorrect-equality
    // slither-disable-start reentrancy-no-eth
    // slither-disable-start reentrancy-benign
    // slither-disable-start timestamp
    /// @notice Swaps tokens. Input tokens must already have been transferred in.
    /// @dev No callback and therefore no flash swaps. The fee-adjusted invariant check
    ///      guarantees the pool is never worse off than before the call.
    /// @param amount0Out Amount of token0 to send out.
    /// @param amount1Out Amount of token1 to send out.
    /// @param to Recipient. Cannot be either pool token or the zero address.
    function swap(uint256 amount0Out, uint256 amount1Out, address to) external nonReentrant {
        if (amount0Out == 0 && amount1Out == 0) revert InsufficientOutputAmount();
        (uint112 _reserve0, uint112 _reserve1,) = getReserves();
        if (amount0Out >= _reserve0 || amount1Out >= _reserve1) revert InsufficientLiquidity();
        if (to == token0 || to == token1 || to == address(0)) revert InvalidTo();

        // Optimistic transfer, validated by the invariant check below.
        if (amount0Out > 0) IERC20(token0).safeTransfer(to, amount0Out);
        if (amount1Out > 0) IERC20(token1).safeTransfer(to, amount1Out);

        uint256 balance0 = IERC20(token0).balanceOf(address(this));
        uint256 balance1 = IERC20(token1).balanceOf(address(this));
        uint256 amount0In =
            balance0 > _reserve0 - amount0Out ? balance0 - (_reserve0 - amount0Out) : 0;
        uint256 amount1In =
            balance1 > _reserve1 - amount1Out ? balance1 - (_reserve1 - amount1Out) : 0;
        if (amount0In == 0 && amount1In == 0) revert InsufficientInputAmount();

        {
            // Overflow reasoning: balances above 2^112 - 1 are rejected by _update, and
            // before that point balance * 1000 < 2^122, so each adjusted balance is
            // below 2^122 and their product is below 2^244, well inside uint256. Larger
            // balances make checked arithmetic revert, which is also the safe outcome.
            uint256 balance0Adjusted = balance0 * 1000 - amount0In * 3;
            uint256 balance1Adjusted = balance1 * 1000 - amount1In * 3;
            if (balance0Adjusted * balance1Adjusted < uint256(_reserve0) * _reserve1 * 1_000_000) {
                revert KInvariant();
            }
        }

        _update(balance0, balance1, _reserve0, _reserve1);
        emit Swap(msg.sender, amount0In, amount1In, amount0Out, amount1Out, to);
    }
    // slither-disable-end timestamp
    // slither-disable-end reentrancy-benign
    // slither-disable-end reentrancy-no-eth
    // slither-disable-end incorrect-equality

    /// @notice Sends any tokens held above the reserves to `to`.
    /// @param to Recipient of the excess.
    function skim(address to) external nonReentrant {
        IERC20(token0).safeTransfer(to, IERC20(token0).balanceOf(address(this)) - reserve0);
        IERC20(token1).safeTransfer(to, IERC20(token1).balanceOf(address(this)) - reserve1);
    }

    /// @notice Forces the reserves to match the current token balances.
    function sync() external nonReentrant {
        _update(
            IERC20(token0).balanceOf(address(this)),
            IERC20(token1).balanceOf(address(this)),
            reserve0,
            reserve1
        );
    }

    // slither-disable-start weak-prng
    // slither-disable-start timestamp
    /// @dev Updates reserves and, on the first call of each block, the price oracle.
    function _update(uint256 balance0, uint256 balance1, uint112 _reserve0, uint112 _reserve1)
        private
    {
        if (balance0 > type(uint112).max || balance1 > type(uint112).max) revert Overflow();

        uint32 blockTimestamp = uint32(block.timestamp % 2 ** 32);
        uint32 timeElapsed;
        // Unchecked on purpose: the timestamp is stored mod 2^32, so the subtraction must
        // wrap around correctly when the 32-bit clock rolls over.
        unchecked {
            timeElapsed = blockTimestamp - blockTimestampLast;
        }
        if (timeElapsed > 0 && _reserve0 != 0 && _reserve1 != 0) {
            // Unchecked on purpose: each term is below 2^224 * 2^32 = 2^256, so a single
            // addition cannot overflow, and the accumulators are meant to wrap modulo
            // 2^256. Consumers take differences of two readings using wrapping math.
            unchecked {
                price0CumulativeLast +=
                    uint256(UQ112x112.uqdiv(UQ112x112.encode(_reserve1), _reserve0)) * timeElapsed;
                price1CumulativeLast +=
                    uint256(UQ112x112.uqdiv(UQ112x112.encode(_reserve0), _reserve1)) * timeElapsed;
            }
        }

        reserve0 = uint112(balance0);
        reserve1 = uint112(balance1);
        blockTimestampLast = blockTimestamp;
        emit Sync(reserve0, reserve1);
    }
    // slither-disable-end timestamp
    // slither-disable-end weak-prng

    // slither-disable-start timestamp
    /// @dev If the protocol fee is on, mints shares to feeTo equal to one sixth of the
    ///      growth in sqrt(k) since the last liquidity event (that is, 0.05% of the
    ///      0.30% fee).
    function _mintFee(uint112 _reserve0, uint112 _reserve1) private returns (bool feeOn) {
        address feeTo = IFactory(factory).feeTo();
        feeOn = feeTo != address(0);
        uint256 _kLast = kLast;
        if (feeOn) {
            if (_kLast != 0) {
                uint256 rootK = Math.sqrt(uint256(_reserve0) * _reserve1);
                uint256 rootKLast = Math.sqrt(_kLast);
                if (rootK > rootKLast) {
                    uint256 numerator = totalSupply() * (rootK - rootKLast);
                    uint256 denominator = rootK * 5 + rootKLast;
                    uint256 liquidity = numerator / denominator;
                    if (liquidity > 0) _mint(feeTo, liquidity);
                }
            }
        } else if (_kLast != 0) {
            kLast = 0;
        }
    }
    // slither-disable-end timestamp
}

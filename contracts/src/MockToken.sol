// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockToken
/// @notice Test ERC20 with configurable decimals and a rate-limited public faucet.
/// @dev For local and testnet use only. There is no owner and no mint function: the whole
///      initial supply goes to one holder in the constructor, and after that the only way
///      to create tokens is the faucet, which gives each address a fixed amount per hour.
contract MockToken is ERC20 {
    /// @notice Whole tokens (before decimals) handed out by each faucet claim.
    uint256 public constant FAUCET_WHOLE_TOKENS = 1000;

    /// @notice Minimum time between faucet claims by the same address.
    uint256 public constant FAUCET_COOLDOWN = 1 hours;

    /// @notice Raw token units handed out by each faucet claim.
    uint256 public immutable faucetAmount;

    /// @notice Timestamp of each address's most recent faucet claim, or zero if none.
    mapping(address => uint256) public lastClaim;

    uint8 private immutable _decimals;

    error FaucetCooldown(uint256 availableAt);

    event FaucetClaimed(address indexed account, uint256 amount);

    /// @param name_ Token name.
    /// @param symbol_ Token symbol.
    /// @param decimals_ Number of decimals.
    /// @param initialHolder Receives the initial supply. Must not be the zero address.
    /// @param initialSupplyWhole Initial supply in whole tokens (before decimals).
    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        address initialHolder,
        uint256 initialSupplyWhole
    ) ERC20(name_, symbol_) {
        _decimals = decimals_;
        uint256 unit = uint256(10) ** decimals_;
        faucetAmount = FAUCET_WHOLE_TOKENS * unit;
        _mint(initialHolder, initialSupplyWhole * unit);
    }

    /// @notice Number of decimals used for display.
    /// @return The token's decimals.
    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    // slither-disable-start timestamp
    /// @notice Mints a fixed amount to the caller, at most once per cooldown period.
    /// @dev The timestamp comparison is the rate limit itself. Block producers can shift
    ///      timestamps by seconds, which is irrelevant for a one-hour cooldown on a
    ///      worthless test token.
    function faucet() external {
        uint256 last = lastClaim[msg.sender];
        if (last != 0 && block.timestamp < last + FAUCET_COOLDOWN) {
            revert FaucetCooldown(last + FAUCET_COOLDOWN);
        }
        lastClaim[msg.sender] = block.timestamp;
        _mint(msg.sender, faucetAmount);
        emit FaucetClaimed(msg.sender, faucetAmount);
    }
    // slither-disable-end timestamp
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Pair} from "../../src/Pair.sol";

/// @dev Test-only token that tries to re-enter the pair while the pair is sending it out.
///      Modes: 1 sync, 2 skim, 3 swap, 4 mint, 5 burn.
contract ReentrantToken is ERC20 {
    Pair public target;
    uint8 public mode;

    constructor() ERC20("Reentrant", "RE") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function arm(address pair_, uint8 mode_) external {
        target = Pair(pair_);
        mode = mode_;
    }

    function transfer(address to, uint256 value) public override returns (bool) {
        if (address(target) != address(0) && msg.sender == address(target)) {
            _reenter();
        }
        return super.transfer(to, value);
    }

    function _reenter() private {
        if (mode == 1) {
            target.sync();
        } else if (mode == 2) {
            target.skim(address(this));
        } else if (mode == 3) {
            target.swap(1, 0, address(0xBEEF));
        } else if (mode == 4) {
            target.mint(address(this));
        } else if (mode == 5) {
            target.burn(address(this));
        }
    }
}

/// @dev Test-only token whose transfer returns false instead of reverting when switched on.
contract FalseReturnToken is ERC20 {
    bool public failTransfers;

    constructor() ERC20("FalseReturn", "FR") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setFailTransfers(bool value) external {
        failTransfers = value;
    }

    function transfer(address to, uint256 value) public override returns (bool) {
        if (failTransfers) return false;
        return super.transfer(to, value);
    }
}

/// @dev Test-only token in the style of USDT: transfer, transferFrom and approve
///      return nothing at all.
contract NoReturnToken {
    string public constant name = "NoReturn";
    string public constant symbol = "NR";
    uint8 public constant decimals = 6;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }

    function approve(address spender, uint256 amount) external {
        allowance[msg.sender][spender] = amount;
    }

    function transfer(address to, uint256 amount) external {
        _move(msg.sender, to, amount);
    }

    function transferFrom(address from, address to, uint256 amount) external {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "allowance");
        if (allowed != type(uint256).max) allowance[from][msg.sender] = allowed - amount;
        _move(from, to, amount);
    }

    function _move(address from, address to, uint256 amount) private {
        require(balanceOf[from] >= amount, "balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
    }
}

/// @dev Test-only token that burns 1% of every transfer. Minting is fee-free.
contract FeeOnTransferToken is ERC20 {
    constructor() ERC20("FeeOnTransfer", "FOT") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) {
            uint256 fee = value / 100;
            super._update(from, to, value - fee);
            super._update(from, address(0), fee);
        } else {
            super._update(from, to, value);
        }
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IFactory} from "./interfaces/IFactory.sol";
import {Pair} from "./Pair.sol";

/// @title Factory
/// @notice Creates one Pair per token combination at a deterministic CREATE2 address
///         and owns the protocol-fee switch.
/// @dev The owner (set through a two-step handover) is the fee setter. There is no
///      upgrade path, no proxy and no pause.
contract Factory is IFactory, Ownable2Step {
    /// @inheritdoc IFactory
    address public feeTo;

    /// @inheritdoc IFactory
    mapping(address => mapping(address => address)) public getPair;

    /// @inheritdoc IFactory
    address[] public allPairs;

    error IdenticalAddresses();
    error ZeroAddress();
    error NotAContract();
    error PairExists();
    error RenounceDisabled();

    event PairCreated(
        address indexed token0, address indexed token1, address pair, uint256 pairCount
    );
    event FeeToUpdated(address indexed previousFeeTo, address indexed newFeeTo);

    /// @param initialOwner Initial fee setter. Must not be the zero address.
    constructor(address initialOwner) Ownable(initialOwner) {}

    /// @inheritdoc IFactory
    function allPairsLength() external view returns (uint256) {
        return allPairs.length;
    }

    /// @notice Hash of the Pair creation code, used to compute pair addresses.
    function pairInitCodeHash() external pure returns (bytes32) {
        return keccak256(type(Pair).creationCode);
    }

    /// @inheritdoc IFactory
    /// @dev Tokens are sorted so (A, B) and (B, A) map to the same pair.
    function createPair(address tokenA, address tokenB) external returns (address pair) {
        if (tokenA == tokenB) revert IdenticalAddresses();
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        if (token0 == address(0)) revert ZeroAddress();
        if (token0.code.length == 0 || token1.code.length == 0) revert NotAContract();
        if (getPair[token0][token1] != address(0)) revert PairExists();

        bytes32 salt = keccak256(abi.encodePacked(token0, token1));
        pair = address(new Pair{salt: salt}());

        // Effects before the interaction: register the pair, then initialize it.
        getPair[token0][token1] = pair;
        getPair[token1][token0] = pair;
        allPairs.push(pair);
        emit PairCreated(token0, token1, pair, allPairs.length);

        Pair(pair).initialize(token0, token1);
    }

    /// @notice Sets the address that receives the protocol fee. Zero disables it.
    /// @param newFeeTo New fee recipient.
    function setFeeTo(address newFeeTo) external onlyOwner {
        emit FeeToUpdated(feeTo, newFeeTo);
        feeTo = newFeeTo;
    }

    /// @notice Disabled. Renouncing would permanently lock the fee setting.
    function renounceOwnership() public view override onlyOwner {
        revert RenounceDisabled();
    }
}

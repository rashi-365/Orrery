// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Factory} from "../src/Factory.sol";
import {Pair} from "../src/Pair.sol";
import {TestToken} from "./mocks/TestToken.sol";

/// Why this file exists: pair creation is the only way pools come into being, so its
/// address determinism, ordering and input validation must hold exactly.
contract FactoryTest is Test {
    Factory internal factory;
    TestToken internal tokenA;
    TestToken internal tokenB;
    address internal owner = makeAddr("owner");
    address internal alice = makeAddr("alice");

    function setUp() public {
        factory = new Factory(owner);
        tokenA = new TestToken("A", "A", 18);
        tokenB = new TestToken("B", "B", 6);
    }

    function test_CreatePairSortsTokensAndRegistersBothDirections() public {
        address pair = factory.createPair(address(tokenA), address(tokenB));
        (address lo, address hi) = address(tokenA) < address(tokenB)
            ? (address(tokenA), address(tokenB))
            : (address(tokenB), address(tokenA));
        assertEq(Pair(pair).token0(), lo);
        assertEq(Pair(pair).token1(), hi);
        assertEq(factory.getPair(lo, hi), pair);
        assertEq(factory.getPair(hi, lo), pair);
        assertEq(factory.allPairsLength(), 1);
        assertEq(factory.allPairs(0), pair);
    }

    function test_PairAddressMatchesCreate2Prediction() public {
        address pair = factory.createPair(address(tokenA), address(tokenB));
        (address lo, address hi) = address(tokenA) < address(tokenB)
            ? (address(tokenA), address(tokenB))
            : (address(tokenB), address(tokenA));
        bytes32 salt = keccak256(abi.encodePacked(lo, hi));
        address predicted =
            vm.computeCreate2Address(salt, factory.pairInitCodeHash(), address(factory));
        assertEq(pair, predicted);
    }

    function test_CreatePairRevertsOnIdenticalTokens() public {
        vm.expectRevert(Factory.IdenticalAddresses.selector);
        factory.createPair(address(tokenA), address(tokenA));
    }

    function test_CreatePairRevertsOnZeroAddress() public {
        vm.expectRevert(Factory.ZeroAddress.selector);
        factory.createPair(address(0), address(tokenA));
    }

    function test_CreatePairRevertsOnNonContract() public {
        vm.expectRevert(Factory.NotAContract.selector);
        factory.createPair(alice, address(tokenA));
    }

    function test_CreatePairRevertsWhenPairExistsInEitherOrder() public {
        factory.createPair(address(tokenA), address(tokenB));
        vm.expectRevert(Factory.PairExists.selector);
        factory.createPair(address(tokenA), address(tokenB));
        vm.expectRevert(Factory.PairExists.selector);
        factory.createPair(address(tokenB), address(tokenA));
    }

    function test_SetFeeToIsOwnerOnly() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", alice));
        factory.setFeeTo(alice);

        vm.prank(owner);
        factory.setFeeTo(alice);
        assertEq(factory.feeTo(), alice);
    }

    function test_OwnershipTransferIsTwoStep() public {
        vm.prank(owner);
        factory.transferOwnership(alice);
        assertEq(factory.owner(), owner);
        vm.prank(alice);
        factory.acceptOwnership();
        assertEq(factory.owner(), alice);
    }

    function test_RenounceOwnershipIsDisabled() public {
        vm.prank(owner);
        vm.expectRevert(Factory.RenounceDisabled.selector);
        factory.renounceOwnership();
    }
}

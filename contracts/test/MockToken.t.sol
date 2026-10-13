// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockToken} from "../src/MockToken.sol";

/// Why this file exists: the mock tokens are deployed to a public testnet, so the faucet's
/// rate limit, its amount across decimals, and the absence of any other way to create tokens
/// must each be pinned down. Arguments are computed before vm.expectRevert / vm.prank,
/// which attach to the next external call.
contract MockTokenTest is Test {
    MockToken internal token;
    address internal holder = makeAddr("holder");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public {
        vm.warp(1_000_000);
        token = new MockToken("Test Token", "TT", 6, holder, 1_000_000);
    }

    function test_ConstructorSetsMetadataAndMintsInitialSupply() public view {
        assertEq(token.name(), "Test Token");
        assertEq(token.symbol(), "TT");
        assertEq(token.decimals(), 6);
        assertEq(token.balanceOf(holder), 1_000_000e6);
        assertEq(token.totalSupply(), 1_000_000e6);
        assertEq(token.faucetAmount(), 1000e6);
    }

    function test_FaucetAmountScalesWithDecimals() public {
        uint8[3] memory decimalsList = [uint8(6), uint8(8), uint8(18)];
        for (uint256 i; i < decimalsList.length; i++) {
            MockToken t = new MockToken("T", "T", decimalsList[i], holder, 1);
            assertEq(t.decimals(), decimalsList[i]);
            assertEq(t.faucetAmount(), 1000 * (uint256(10) ** decimalsList[i]));
        }
    }

    function test_ConstructorRevertsOnZeroHolder() public {
        vm.expectRevert(abi.encodeWithSignature("ERC20InvalidReceiver(address)", address(0)));
        new MockToken("T", "T", 18, address(0), 1);
    }

    function test_FaucetMintsFixedAmountOnFirstClaim() public {
        vm.prank(alice);
        token.faucet();
        assertEq(token.balanceOf(alice), 1000e6);
        assertEq(token.totalSupply(), 1_000_000e6 + 1000e6);
        assertEq(token.lastClaim(alice), block.timestamp);
    }

    function test_FaucetEmitsEvent() public {
        vm.expectEmit(true, false, false, true);
        emit MockToken.FaucetClaimed(alice, 1000e6);
        vm.prank(alice);
        token.faucet();
    }

    function test_FaucetRevertsDuringCooldown() public {
        vm.prank(alice);
        token.faucet();
        vm.warp(block.timestamp + 30 minutes);
        uint256 availableAt = token.lastClaim(alice) + token.FAUCET_COOLDOWN();

        vm.expectRevert(abi.encodeWithSelector(MockToken.FaucetCooldown.selector, availableAt));
        vm.prank(alice);
        token.faucet();
        assertEq(token.balanceOf(alice), 1000e6);
    }

    function test_FaucetCooldownBoundaryIsExact() public {
        vm.prank(alice);
        token.faucet();
        uint256 availableAt = token.lastClaim(alice) + token.FAUCET_COOLDOWN();

        vm.warp(availableAt - 1);
        vm.expectRevert(abi.encodeWithSelector(MockToken.FaucetCooldown.selector, availableAt));
        vm.prank(alice);
        token.faucet();

        vm.warp(availableAt);
        vm.prank(alice);
        token.faucet();
        assertEq(token.balanceOf(alice), 2000e6);
    }

    function test_FaucetCooldownIsPerAccount() public {
        vm.prank(alice);
        token.faucet();
        vm.prank(bob);
        token.faucet();
        assertEq(token.balanceOf(alice), 1000e6);
        assertEq(token.balanceOf(bob), 1000e6);
    }

    function test_RepeatedClaimsEachCooldownAddUpLinearly() public {
        for (uint256 i; i < 5; i++) {
            vm.prank(alice);
            token.faucet();
            vm.warp(block.timestamp + token.FAUCET_COOLDOWN());
        }
        assertEq(token.balanceOf(alice), 5000e6);
    }

    function testFuzz_SecondClaimSucceedsExactlyWhenCooldownHasPassed(uint256 elapsedSeed) public {
        uint256 elapsed = bound(elapsedSeed, 0, 10 hours);
        vm.prank(alice);
        token.faucet();
        uint256 availableAt = token.lastClaim(alice) + token.FAUCET_COOLDOWN();
        vm.warp(block.timestamp + elapsed);

        if (elapsed < 1 hours) {
            vm.expectRevert(abi.encodeWithSelector(MockToken.FaucetCooldown.selector, availableAt));
            vm.prank(alice);
            token.faucet();
            assertEq(token.balanceOf(alice), 1000e6);
        } else {
            vm.prank(alice);
            token.faucet();
            assertEq(token.balanceOf(alice), 2000e6);
        }
    }
}

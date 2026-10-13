// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Deploy} from "../script/Deploy.s.sol";
import {Factory} from "../src/Factory.sol";
import {Pair} from "../src/Pair.sol";
import {Router} from "../src/Router.sol";
import {MockToken} from "../src/MockToken.sol";

/// Why this file exists: the deploy script is what builds the world the web app and the
/// simulator run against, so its output must be exactly what the config promises: 16
/// tokens with mixed decimals, 25 pools seeded at the intended USD values, no stray
/// custody in the router, and JSON the app can parse. The script contract itself plays the
/// deployer, because it is the one making the calls inside deployAll.
contract DeployTest is Test {
    Deploy internal script;
    Factory internal factory;
    Router internal router;
    MockToken[] internal tokens;
    uint256 internal startBlock;

    function setUp() public {
        script = new Deploy();
        Deploy.Deployment memory d = script.deployAll(address(script));
        factory = d.factory;
        router = d.router;
        startBlock = d.startBlock;
        for (uint256 i; i < d.tokens.length; i++) {
            tokens.push(d.tokens[i]);
        }
    }

    function test_DeploysSixteenTokensWithMixedDecimals() public view {
        assertEq(tokens.length, 16);
        uint256 six;
        uint256 eight;
        uint256 eighteen;
        for (uint256 i; i < tokens.length; i++) {
            uint8 dec = tokens[i].decimals();
            if (dec == 6) six++;
            else if (dec == 8) eight++;
            else if (dec == 18) eighteen++;
        }
        assertEq(six, 5);
        assertEq(eight, 4);
        assertEq(eighteen, 7);
    }

    function test_CreatesTwentyFivePairs() public view {
        assertEq(factory.allPairsLength(), 25);
    }

    function test_EveryPoolHoldsTheIntendedValueOnBothSides() public view {
        Deploy.PoolSpec[] memory pools = script.poolSpecs();
        Deploy.TokenSpec[] memory specs = script.tokenSpecs();
        for (uint256 i; i < pools.length; i++) {
            _assertPool(pools[i], specs);
        }
    }

    function test_EveryTokenIsInAtLeastTwoPools() public view {
        Deploy.PoolSpec[] memory pools = script.poolSpecs();
        uint256[] memory counts = new uint256[](tokens.length);
        for (uint256 i; i < pools.length; i++) {
            counts[pools[i].tokenA]++;
            counts[pools[i].tokenB]++;
        }
        for (uint256 i; i < counts.length; i++) {
            assertGe(counts[i], 2);
        }
    }

    function test_DeployerOwnsFactoryAndAllLiquiditySharesExceptTheLockedOnes() public view {
        assertEq(factory.owner(), address(script));
        for (uint256 i; i < factory.allPairsLength(); i++) {
            Pair pair = Pair(factory.allPairs(i));
            assertEq(pair.balanceOf(address(script)), pair.totalSupply() - pair.MINIMUM_LIQUIDITY());
        }
    }

    function test_RouterHoldsNoTokensAfterDeployment() public view {
        for (uint256 i; i < tokens.length; i++) {
            assertEq(tokens[i].balanceOf(address(router)), 0);
        }
    }

    function test_DeployerKeepsMostOfEachSupplyForFundingSimulatorWallets() public view {
        for (uint256 i; i < tokens.length; i++) {
            uint256 left = tokens[i].balanceOf(address(script));
            assertGt(left * 10, tokens[i].totalSupply() * 9);
        }
    }

    function test_RenderedJsonParsesAndMatchesDeployment() public view {
        MockToken[] memory copy = tokens;
        Deploy.Deployment memory d = Deploy.Deployment({
            startBlock: startBlock,
            deployer: address(script),
            factory: factory,
            router: router,
            tokens: copy
        });
        string memory json = script.renderJson(d);
        Deploy.PoolSpec[] memory pools = script.poolSpecs();
        Deploy.TokenSpec[] memory specs = script.tokenSpecs();

        assertEq(vm.parseJsonUint(json, ".chainId"), block.chainid);
        assertEq(vm.parseJsonUint(json, ".deployBlock"), startBlock);
        assertEq(vm.parseJsonAddress(json, ".deployer"), address(script));
        assertEq(vm.parseJsonAddress(json, ".factory"), address(factory));
        assertEq(vm.parseJsonAddress(json, ".router"), address(router));
        assertEq(vm.parseJsonAddress(json, ".tokens[0].address"), address(tokens[0]));
        assertEq(vm.parseJsonAddress(json, ".tokens[15].address"), address(tokens[15]));
        assertEq(vm.parseJsonString(json, ".tokens[15].symbol"), specs[15].symbol);
        assertEq(vm.parseJsonUint(json, ".tokens[2].decimals"), specs[2].decimals);

        address lastPair = factory.getPair(
            address(tokens[pools[24].tokenA]), address(tokens[pools[24].tokenB])
        );
        assertEq(vm.parseJsonAddress(json, ".pairs[24].address"), lastPair);
        assertEq(vm.parseJsonAddress(json, ".pairs[0].token0"), Pair(factory.allPairs(0)).token0());
        assertEq(vm.parseJsonAddress(json, ".pairs[0].token1"), Pair(factory.allPairs(0)).token1());
    }

    function test_RunRevertsOnUnsupportedChain() public {
        vm.chainId(1);
        vm.expectRevert(abi.encodeWithSelector(Deploy.UnsupportedChain.selector, uint256(1)));
        script.run();
    }

    // ---------------------------------------------------------------- helpers

    function _assertPool(Deploy.PoolSpec memory p, Deploy.TokenSpec[] memory specs) internal view {
        MockToken a = tokens[p.tokenA];
        MockToken b = tokens[p.tokenB];
        address pairAddress = factory.getPair(address(a), address(b));
        assertTrue(pairAddress != address(0));

        uint256 balA = a.balanceOf(pairAddress);
        uint256 balB = b.balanceOf(pairAddress);
        assertEq(balA, script.amountFor(p.valueUsd, specs[p.tokenA]));
        assertEq(balB, script.amountFor(p.valueUsd, specs[p.tokenB]));
        _assertValue(balA, specs[p.tokenA], p.valueUsd);
        _assertValue(balB, specs[p.tokenB], p.valueUsd);

        (uint112 r0, uint112 r1,) = Pair(pairAddress).getReserves();
        (uint256 expected0, uint256 expected1) =
            Pair(pairAddress).token0() == address(a) ? (balA, balB) : (balB, balA);
        assertEq(r0, expected0);
        assertEq(r1, expected1);
    }

    /// @dev The side's USD value in cents, rounded down, is within one cent of the target.
    function _assertValue(uint256 balance, Deploy.TokenSpec memory spec, uint256 valueUsd)
        internal
        pure
    {
        uint256 cents = (balance * spec.priceCents) / (uint256(10) ** spec.decimals);
        assertLe(cents, valueUsd * 100);
        assertGe(cents + 1, valueUsd * 100);
    }
}

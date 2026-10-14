// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {Factory} from "../src/Factory.sol";
import {Pair} from "../src/Pair.sol";
import {Router} from "../src/Router.sol";
import {MockToken} from "../src/MockToken.sol";

/// @title Deploy
/// @notice Deploys the factory, the router, 16 mock tokens and 25 seeded pools, then writes
///         the addresses to web/config/deployments/<chainId>.json for the web app.
/// @dev Only runs on local Anvil (31337) and Sepolia (11155111). Pools are seeded at
///      consistent USD prices so no pool is arbitrageable against another at launch.
///      The config file is written only when actually broadcasting, never on a dry run.
///      Run from the contracts directory:
///      forge script script/Deploy.s.sol:Deploy --rpc-url $RPC_URL --private-key $KEY --broadcast
contract Deploy is Script {
    uint256 internal constant LOCAL_CHAIN_ID = 31337;
    uint256 internal constant SEPOLIA_CHAIN_ID = 11155111;
    uint256 internal constant INITIAL_SUPPLY_WHOLE = 100_000_000;

    struct TokenSpec {
        string name;
        string symbol;
        uint8 decimals;
        uint256 priceCents;
    }

    struct PoolSpec {
        uint8 tokenA;
        uint8 tokenB;
        uint256 valueUsd; // whole USD value of EACH side of the pool
    }

    struct Deployment {
        uint256 startBlock;
        address deployer;
        Factory factory;
        Router router;
        MockToken[] tokens;
    }

    error UnsupportedChain(uint256 chainId);

    function run() external {
        if (block.chainid != LOCAL_CHAIN_ID && block.chainid != SEPOLIA_CHAIN_ID) {
            revert UnsupportedChain(block.chainid);
        }

        vm.startBroadcast();
        (, address deployer,) = vm.readCallers();
        Deployment memory d = deployAll(deployer);
        vm.stopBroadcast();

        if (vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)) {
            string memory path =
                string.concat("../web/config/deployments/", vm.toString(block.chainid), ".json");
            vm.writeFile(path, renderJson(d));
        }
    }

    /// @notice Deploys everything as `deployer`, who owns the factory and receives the
    ///         token supply and all liquidity shares. Public so tests can run it directly.
    function deployAll(address deployer) public returns (Deployment memory d) {
        TokenSpec[] memory specs = tokenSpecs();
        PoolSpec[] memory pools = poolSpecs();

        d.startBlock = block.number;
        d.deployer = deployer;
        d.factory = new Factory(deployer);
        d.router = new Router(address(d.factory));

        d.tokens = new MockToken[](specs.length);
        for (uint256 i; i < specs.length; i++) {
            d.tokens[i] = new MockToken(
                specs[i].name, specs[i].symbol, specs[i].decimals, deployer, INITIAL_SUPPLY_WHOLE
            );
        }
        for (uint256 i; i < pools.length; i++) {
            _seedPool(d, specs, pools[i]);
        }
    }

    /// @notice Raw token units worth `valueUsd` whole dollars at the token's seed price.
    function amountFor(uint256 valueUsd, TokenSpec memory spec) public pure returns (uint256) {
        return (valueUsd * 100 * (uint256(10) ** spec.decimals)) / spec.priceCents;
    }

    /// @notice The 16 tokens: five with 6 decimals, four with 8, seven with 18.
    function tokenSpecs() public pure returns (TokenSpec[] memory s) {
        s = new TokenSpec[](16);
        s[0] = TokenSpec("Luna", "LUNA", 6, 100);
        s[1] = TokenSpec("Terra", "TERR", 6, 100);
        s[2] = TokenSpec("Io", "IO", 6, 50);
        s[3] = TokenSpec("Europa", "EURA", 6, 200);
        s[4] = TokenSpec("Phobos", "PHOB", 6, 10);
        s[5] = TokenSpec("Mercury", "MERC", 8, 12000);
        s[6] = TokenSpec("Venus", "VENU", 8, 4500);
        s[7] = TokenSpec("Mars", "MARS", 8, 1800);
        s[8] = TokenSpec("Callisto", "CALL", 8, 750);
        s[9] = TokenSpec("Jupiter", "JOVE", 18, 300000);
        s[10] = TokenSpec("Saturn", "SATU", 18, 120000);
        s[11] = TokenSpec("Uranus", "URAN", 18, 35000);
        s[12] = TokenSpec("Neptune", "NEPT", 18, 6000);
        s[13] = TokenSpec("Ganymede", "GANY", 18, 1200);
        s[14] = TokenSpec("Titan", "TITA", 18, 400);
        s[15] = TokenSpec("Triton", "TRIT", 18, 80);
    }

    /// @notice The 25 pools. LUNA pairs with every other token; the rest give every token
    ///         a second pool and make the network map more than a star.
    function poolSpecs() public pure returns (PoolSpec[] memory p) {
        p = new PoolSpec[](25);
        p[0] = PoolSpec(0, 1, 2_000_000);
        p[1] = PoolSpec(0, 2, 150_000);
        p[2] = PoolSpec(0, 3, 400_000);
        p[3] = PoolSpec(0, 4, 40_000);
        p[4] = PoolSpec(0, 5, 900_000);
        p[5] = PoolSpec(0, 6, 250_000);
        p[6] = PoolSpec(0, 7, 120_000);
        p[7] = PoolSpec(0, 8, 60_000);
        p[8] = PoolSpec(0, 9, 1_500_000);
        p[9] = PoolSpec(0, 10, 800_000);
        p[10] = PoolSpec(0, 11, 200_000);
        p[11] = PoolSpec(0, 12, 350_000);
        p[12] = PoolSpec(0, 13, 90_000);
        p[13] = PoolSpec(0, 14, 70_000);
        p[14] = PoolSpec(0, 15, 25_000);
        p[15] = PoolSpec(1, 2, 80_000);
        p[16] = PoolSpec(1, 3, 220_000);
        p[17] = PoolSpec(1, 5, 300_000);
        p[18] = PoolSpec(1, 9, 500_000);
        p[19] = PoolSpec(1, 10, 260_000);
        p[20] = PoolSpec(4, 7, 20_000);
        p[21] = PoolSpec(6, 8, 30_000);
        p[22] = PoolSpec(11, 12, 120_000);
        p[23] = PoolSpec(13, 14, 45_000);
        p[24] = PoolSpec(15, 12, 35_000);
    }

    /// @notice Renders the deployment as the JSON the web app imports.
    function renderJson(Deployment memory d) public view returns (string memory) {
        TokenSpec[] memory specs = tokenSpecs();
        PoolSpec[] memory pools = poolSpecs();
        string memory head = string.concat(
            '{\n  "chainId": ',
            vm.toString(block.chainid),
            ',\n  "deployBlock": ',
            vm.toString(d.startBlock),
            ',\n'
        );
        head = string.concat(
            head,
            '  "deployer": "',
            vm.toString(d.deployer),
            '",\n  "factory": "',
            vm.toString(address(d.factory)),
            '",\n'
        );
        head = string.concat(head, '  "router": "', vm.toString(address(d.router)), '",\n');
        return string.concat(head, _tokensJson(d, specs), ',\n', _pairsJson(d, pools), "\n}\n");
    }

    function _seedPool(Deployment memory d, TokenSpec[] memory specs, PoolSpec memory p) internal {
        _addLiquidity(
            d.router,
            d.deployer,
            d.tokens[p.tokenA],
            d.tokens[p.tokenB],
            amountFor(p.valueUsd, specs[p.tokenA]),
            amountFor(p.valueUsd, specs[p.tokenB])
        );
    }

    /// @dev Exact approvals for exactly what the router will pull, then the deposit.
    function _addLiquidity(
        Router router,
        address to,
        MockToken tokenA,
        MockToken tokenB,
        uint256 amountA,
        uint256 amountB
    ) internal {
        tokenA.approve(address(router), amountA);
        tokenB.approve(address(router), amountB);
        router.addLiquidity(
            address(tokenA),
            address(tokenB),
            amountA,
            amountB,
            amountA,
            amountB,
            to,
            block.timestamp + 1 days
        );
    }

    function _tokensJson(Deployment memory d, TokenSpec[] memory specs)
        internal
        pure
        returns (string memory out)
    {
        out = '  "tokens": [\n';
        for (uint256 i; i < specs.length; i++) {
            string memory line = string.concat(
                '    {"symbol": "', specs[i].symbol, '", "name": "', specs[i].name, '", '
            );
            line = string.concat(
                line,
                '"decimals": ',
                vm.toString(uint256(specs[i].decimals)),
                ', "address": "',
                vm.toString(address(d.tokens[i])),
                '"}'
            );
            string memory sep = ",\n";
            if (i + 1 == specs.length) sep = "\n";
            out = string.concat(out, line, sep);
        }
        out = string.concat(out, "  ]");
    }

    function _pairsJson(Deployment memory d, PoolSpec[] memory pools)
        internal
        view
        returns (string memory out)
    {
        out = '  "pairs": [\n';
        for (uint256 i; i < pools.length; i++) {
            address pair = d.factory
                .getPair(address(d.tokens[pools[i].tokenA]), address(d.tokens[pools[i].tokenB]));
            string memory line = string.concat(
                '    {"address": "',
                vm.toString(pair),
                '", "token0": "',
                vm.toString(Pair(pair).token0()),
                '", '
            );
            line = string.concat(line, '"token1": "', vm.toString(Pair(pair).token1()), '"}');
            string memory sep = ",\n";
            if (i + 1 == pools.length) sep = "\n";
            out = string.concat(out, line, sep);
        }
        out = string.concat(out, "  ]");
    }
}

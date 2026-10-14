import { parseAbi } from "viem";

export const erc20Abi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 value) returns (bool)",
  "function totalSupply() view returns (uint256)",
]);

export const faucetAbi = parseAbi([
  "function faucet()",
  "error FaucetCooldown(uint256 availableAt)",
]);

export const pairAbi = parseAbi([
  "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
]);

// Errors from the router, the library, the pairs, the factory and OpenZeppelin are listed so
// that a revert coming from any of them is decoded into a name.
export const routerAbi = parseAbi([
  "function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[] amounts)",
  "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[] amounts)",
  "function addLiquidity(address tokenA, address tokenB, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) returns (uint256 amountA, uint256 amountB, uint256 liquidity)",
  "function removeLiquidity(address tokenA, address tokenB, uint256 liquidity, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) returns (uint256 amountA, uint256 amountB)",
  "error Expired()",
  "error ZeroAddress()",
  "error InsufficientAAmount()",
  "error InsufficientBAmount()",
  "error InsufficientOutputAmount()",
  "error ExcessiveInputAmount()",
  "error IdenticalAddresses()",
  "error PairNotFound()",
  "error InsufficientAmount()",
  "error InsufficientInputAmount()",
  "error InsufficientLiquidity()",
  "error InvalidPath()",
  "error Forbidden()",
  "error AlreadyInitialized()",
  "error Overflow()",
  "error InsufficientLiquidityMinted()",
  "error InsufficientLiquidityBurned()",
  "error InvalidTo()",
  "error KInvariant()",
  "error NotAContract()",
  "error PairExists()",
  "error ReentrancyGuardReentrantCall()",
  "error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed)",
  "error ERC20InsufficientAllowance(address spender, uint256 allowance, uint256 needed)",
  "error SafeERC20FailedOperation(address token)",
]);

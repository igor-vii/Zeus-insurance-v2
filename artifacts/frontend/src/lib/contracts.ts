// ─── Deployed contract addresses (Base Sepolia testnet) ──────────────────────
export const ZEUS_INSURANCE_ADDRESS =
  "0xE0b89E0DEa7Fc7AEa7CEcC62a0A14d52de42Ce3b" as const;

export const ZEUS_RESERVE_ADDRESS =
  "0xF5010Afe1856be1F447f962Dfa8AA30c2Ed19a47" as const;

// USDC on Base Sepolia (6 decimals) — 0x036CbD53842c5426634e7929541eC2318f3dCF7e
export const USDC_ADDRESS =
  "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;

// ─── ZeusInsuranceV2 ABI ─────────────────────────────────────────────────────
export const ZEUS_INSURANCE_ABI = [
  {
    inputs: [{ internalType: "address", name: "_usdc", type: "address" }, { internalType: "address", name: "_reserve", type: "address" }],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  { inputs: [{ internalType: "address", name: "owner", type: "address" }], name: "OwnableInvalidOwner", type: "error" },
  { inputs: [{ internalType: "address", name: "account", type: "address" }], name: "OwnableUnauthorizedAccount", type: "error" },
  { inputs: [], name: "ReentrancyGuardReentrantCall", type: "error" },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "claimId", type: "uint256" },
      { indexed: true, internalType: "address", name: "claimant", type: "address" },
      { indexed: false, internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "ClaimApproved",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "previousOwner", type: "address" },
      { indexed: true, internalType: "address", name: "newOwner", type: "address" },
    ],
    name: "OwnershipTransferred",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "policyId", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "PayoutExecuted",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "policyId", type: "uint256" },
      { indexed: true, internalType: "address", name: "buyer", type: "address" },
      { indexed: true, internalType: "address", name: "seller", type: "address" },
      { indexed: false, internalType: "uint256", name: "amount", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "premium", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "retryDeadline", type: "uint256" },
    ],
    name: "PolicyCreated",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [{ indexed: true, internalType: "uint256", name: "policyId", type: "uint256" }],
    name: "PolicyExpired",
    type: "event",
  },
  {
    inputs: [
      { internalType: "address", name: "seller", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
      { internalType: "uint256", name: "timeoutSeconds", type: "uint256" },
      { internalType: "uint256", name: "maxRetries", type: "uint256" },
    ],
    name: "buyInsurance",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "policyId", type: "uint256" }],
    name: "claimPayout",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "claimId", type: "uint256" },
      { internalType: "address", name: "claimant", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "isClaimApproved",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "claimId", type: "uint256" }],
    name: "markClaimFulfilled",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "nextPolicyId",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "owner",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    name: "policies",
    outputs: [
      { internalType: "address", name: "buyer", type: "address" },
      { internalType: "address", name: "seller", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
      { internalType: "uint256", name: "premium", type: "uint256" },
      { internalType: "uint256", name: "retryDeadline", type: "uint256" },
      { internalType: "uint256", name: "maxRetries", type: "uint256" },
      { internalType: "bool", name: "isActive", type: "bool" },
      { internalType: "bool", name: "isPaidOut", type: "bool" },
      { internalType: "bool", name: "isExpired", type: "bool" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "policyId", type: "uint256" }],
    name: "getPolicy",
    outputs: [
      {
        components: [
          { internalType: "address", name: "buyer", type: "address" },
          { internalType: "address", name: "seller", type: "address" },
          { internalType: "uint256", name: "amount", type: "uint256" },
          { internalType: "uint256", name: "premium", type: "uint256" },
          { internalType: "uint256", name: "retryDeadline", type: "uint256" },
          { internalType: "uint256", name: "maxRetries", type: "uint256" },
          { internalType: "bool", name: "isActive", type: "bool" },
          { internalType: "bool", name: "isPaidOut", type: "bool" },
          { internalType: "bool", name: "isExpired", type: "bool" },
        ],
        internalType: "struct ZeusInsuranceV2.Policy",
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "reserve",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "_reserve", type: "address" }],
    name: "setReserve",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "usdc",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// ─── ZeusReserveV2 ABI ───────────────────────────────────────────────────────
export const ZEUS_RESERVE_ABI = [
  {
    inputs: [{ internalType: "address", name: "_usdc", type: "address" }, { internalType: "address", name: "initialOwner", type: "address" }],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  { inputs: [{ internalType: "uint256", name: "claimId", type: "uint256" }], name: "ClaimAlreadyFulfilled", type: "error" },
  { inputs: [{ internalType: "uint256", name: "claimId", type: "uint256" }], name: "ClaimNotApproved", type: "error" },
  { inputs: [{ internalType: "uint256", name: "attempted", type: "uint256" }, { internalType: "uint256", name: "remaining", type: "uint256" }], name: "DailyPayoutLimitExceeded", type: "error" },
  { inputs: [{ internalType: "uint256", name: "available", type: "uint256" }, { internalType: "uint256", name: "required", type: "uint256" }], name: "InsufficientReserve", type: "error" },
  { inputs: [{ internalType: "address", name: "addr", type: "address" }], name: "NotAContract", type: "error" },
  { inputs: [{ internalType: "address", name: "caller", type: "address" }], name: "NotInsuranceContract", type: "error" },
  { inputs: [], name: "ReserveBelowThreshold", type: "error" },
  { inputs: [], name: "TransferFailed", type: "error" },
  { inputs: [], name: "ZeroAddress", type: "error" },
  { inputs: [], name: "ZeroAmount", type: "error" },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "claimId", type: "uint256" },
      { indexed: true, internalType: "address", name: "claimant", type: "address" },
      { indexed: false, internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "ClaimPaid",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "oldContract", type: "address" },
      { indexed: true, internalType: "address", name: "newContract", type: "address" },
    ],
    name: "InsuranceContractUpdated",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: false, internalType: "uint256", name: "oldValue", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "newValue", type: "uint256" },
    ],
    name: "MaxDailyPayoutUpdated",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: false, internalType: "uint256", name: "oldValue", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "newValue", type: "uint256" },
    ],
    name: "MinReserveThresholdUpdated",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "from", type: "address" },
      { indexed: false, internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "ReserveDeposited",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "to", type: "address" },
      { indexed: false, internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "ReserveWithdrawn",
    type: "event",
  },
  {
    inputs: [{ internalType: "uint256", name: "amount", type: "uint256" }],
    name: "deposit",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "dailyPayouts",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    name: "fulfilledClaims",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getReserveBalance",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "isAdequatelyFunded",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "insuranceContract",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "maxDailyPayout",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "minReserveThreshold",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "owner",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "remainingDailyPayout",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "_contract", type: "address" }],
    name: "setInsuranceContract",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "usdc",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "amount", type: "uint256" }],
    name: "withdraw",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

// ─── ERC-20 minimal ABI (for USDC approve / allowance / balanceOf) ────────────
export const ERC20_ABI = [
  {
    inputs: [{ internalType: "address", name: "spender", type: "address" }, { internalType: "uint256", name: "amount", type: "uint256" }],
    name: "approve",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "owner", type: "address" }, { internalType: "address", name: "spender", type: "address" }],
    name: "allowance",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ internalType: "uint8", name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────
export const USDC_DECIMALS = 6;

/** Format a raw USDC bigint (6 decimals) to a human-readable string. */
export function formatUsdc(raw: bigint | undefined, decimals = 2): string {
  if (raw === undefined) return "–";
  const divisor = 10n ** BigInt(USDC_DECIMALS);
  const whole = raw / divisor;
  const frac = raw % divisor;
  const fracStr = frac.toString().padStart(USDC_DECIMALS, "0").slice(0, decimals);
  return `${whole.toLocaleString()}.${fracStr}`;
}

/** Parse a human-readable USDC string (e.g. "100.50") to a bigint. */
export function parseUsdc(value: string): bigint {
  const [whole = "0", frac = ""] = value.split(".");
  const fracPadded = frac.padEnd(USDC_DECIMALS, "0").slice(0, USDC_DECIMALS);
  return BigInt(whole) * 10n ** BigInt(USDC_DECIMALS) + BigInt(fracPadded || "0");
}

/** Premium = (7% + 2%×(retries−1)) of amount */
export function computePremium(amount: bigint, retries: number): bigint {
  const bps = BigInt(700 + (retries - 1) * 200);
  return (amount * bps) / 10_000n;
}

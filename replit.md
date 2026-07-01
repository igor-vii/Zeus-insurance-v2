# Zeus Reserve — Smart Contract Project

A Hardhat project for Solidity smart contracts targeting Base Sepolia. Contains the `ZeusReserve` reserve contract and its integration interface with an existing insurance contract.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

### Contracts (`contracts/`)

- `pnpm --filter @workspace/contracts run compile` — compile Solidity contracts
- `pnpm --filter @workspace/contracts run test` — run Hardhat tests (local in-process network)
- `pnpm --filter @workspace/contracts run deploy:baseSepolia` — deploy to Base Sepolia
- `pnpm --filter @workspace/contracts run verify <address> <args>` — verify on Basescan

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Smart contracts: Hardhat 2, Solidity 0.8.27, OpenZeppelin 5, ethers v6

## Where things live

- `contracts/contracts/ZeusReserve.sol` — main reserve contract
- `contracts/contracts/interfaces/IInsuranceContract.sol` — interface your existing insurance contract must implement
- `contracts/contracts/test/MockInsurance.sol` — mock used in unit tests only
- `contracts/scripts/deploy.ts` — deployment script for Base Sepolia
- `contracts/test/ZeusReserve.test.ts` — full test suite
- `contracts/hardhat.config.ts` — Hardhat config (networks, etherscan, typechain)
- `contracts/.env.example` — template for required env vars

## Architecture decisions

- **CEI pattern in payClaim**: funds are transferred before `markClaimFulfilled` is called to prevent reentrancy, combined with `ReentrancyGuard` for belt-and-suspenders safety.
- **Interface-based insurance integration**: `IInsuranceContract` decouples `ZeusReserve` from any specific insurance implementation; drop-in the interface on the existing contract.
- **Only insurance contract can trigger payouts**: `payClaim` reverts unless `msg.sender == insuranceContract`, so no external actor can drain the reserve.
- **Soft minimum reserve**: `minimumReserve` is informational — readable on-chain but not enforced — to avoid blocking payouts when reserves run low unexpectedly.

## Product

ZeusReserve is a collateralised reserve pool for the Zeus insurance protocol. It holds ETH and releases funds only when an approved insurance claim is verified and triggered by the registered insurance contract.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- **Always compile before testing**: `pnpm --filter @workspace/contracts run compile` first if typechain types are stale.
- **Impersonation in tests**: `hardhat_impersonateAccount` is used to simulate calls from the mock insurance contract address — this is a Hardhat-network-only feature and only runs locally.
- **Base Sepolia faucets**: Get test ETH at https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet
- Required env: `PRIVATE_KEY`, optional `BASE_SEPOLIA_RPC_URL` (defaults to `https://sepolia.base.org`), `BASESCAN_API_KEY` for verification.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details

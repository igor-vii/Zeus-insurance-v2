# Zeus Insurance — Decentralized Insurance Protocol

A full-stack dApp for protecting AI agent-to-agent payments on **Base Sepolia**. Buyers pay a small premium to insure an API call; if the seller fails to deliver within the timeout, the protocol automatically pays out from the reserve fund.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

---

## Run & Operate

```bash
# Start both services (already configured as Replit workflows)
PORT=8080 pnpm --filter @workspace/api-server run dev   # API server on :8080
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/frontend run dev  # Frontend on :5173

# Workspace-wide commands
pnpm run typecheck       # full typecheck across all packages
pnpm run build           # typecheck + build all packages

# Contracts
pnpm --filter @workspace/contracts run compile          # compile Solidity
pnpm --filter @workspace/contracts run test             # run Hardhat tests
pnpm --filter @workspace/contracts run deploy:baseSepolia  # deploy to Base Sepolia
```

---

## Deployed Contracts (Base Sepolia)

| Contract          | Address                                      |
|-------------------|----------------------------------------------|
| ZeusInsuranceV2   | `0xE0b89E0DEa7Fc7AEa7CEcC62a0A14d52de42Ce3b` |
| ZeusReserveV2     | `0xF5010Afe1856be1F447f962Dfa8AA30c2Ed19a47` |
| USDC (Base Sepolia) | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |

Get testnet ETH: <https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet>

---

## API Mode

The frontend supports two data-source modes, switchable via the toggle in the sidebar footer (or mobile header):

| Mode       | How it works |
|------------|--------------|
| **Direct** (default) | All reads and writes go straight to Base Sepolia via wagmi/viem in the browser |
| **API**    | The frontend calls the Express API server (`:8080`), which multicalls the chain and returns ABI-encoded calldata. The frontend still signs and broadcasts transactions locally — no private keys on the server |

The mode is persisted to `localStorage` (key `zeus_api_mode`). A coloured dot next to the toggle shows live API reachability: green = healthy, yellow = checking, red = unreachable.

### API Endpoints (base URL: `http://localhost:8080/api`)

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/healthz` | Health check — returns `{ "status": "ok" }` |
| `GET`  | `/api/quote?amount=&maxRetries=` | Compute premium without sending a transaction |
| `POST` | `/api/prepare-buy` | Returns `{ to, data }` calldata to call `buyInsurance` |
| `GET`  | `/api/policies?buyer=` | Fetch all policies for an address (event log + multicall) |
| `GET`  | `/api/policies/:id` | Fetch a single policy by ID |
| `POST` | `/api/claim` | Returns `{ to, data }` calldata to call `claimPayout` |
| `GET`  | `/api/reserve` | Fetch reserve stats (balance, thresholds, daily limits) |

**Example — get a quote:**
```bash
curl "http://localhost:8080/api/quote?amount=100000000&maxRetries=3"
# {"premiumBps":1100,"premiumAmount":"11000000","totalCost":"11000000"}
```

**Example — prepare a buy (returns calldata for the frontend to sign):**
```bash
curl -X POST http://localhost:8080/api/prepare-buy \
  -H "Content-Type: application/json" \
  -d '{"seller":"0xSELLER","amount":"100000000","timeoutSeconds":86400,"maxRetries":1}'
# {"to":"0xE0b89E...","data":"0x...","premiumAmount":"7000000"}
```

---

## Netlify Deploy

A `netlify.toml` is included at the repo root. To deploy the frontend:

1. Connect the repo to Netlify.
2. Netlify auto-detects the build config (`publish = artifacts/frontend/dist/public`).
3. Set the environment variable **`VITE_API_BASE_URL`** to your deployed API server URL (e.g. `https://zeus-api.example.com/api`). If left unset, the frontend defaults to `/api` (same-origin proxy).
4. Deploy. Netlify handles SPA routing via the `[[redirects]]` rule.

---

## Stack

- **Frontend**: React 19, Vite, Tailwind CSS, wagmi v3, viem v2, Shadcn/UI, TanStack Query
- **API Server**: Express 5, viem (multicall), Zod validation, pino logging
- **Contracts**: Solidity 0.8.27, Hardhat 2, OpenZeppelin 5
- **Monorepo**: pnpm workspaces, Node.js 24, TypeScript 5.9

## Where things live

```
artifacts/
  frontend/          React + Vite app
    src/
      lib/
        contracts.ts   ABIs + Base Sepolia addresses
        wagmi.ts       wagmi config (baseSepolia chain)
        api-mode.tsx   API/Direct mode context + hook
        api-client.ts  Typed API call functions
      components/
        api-mode-toggle.tsx  Toggle + live health dot
        layout.tsx           Sidebar + mobile nav
      pages/
        buy.tsx        Buy policy (dual mode)
        policies.tsx   My policies + claim (dual mode)
        reserve.tsx    Reserve stats + deposit (dual mode)
  api-server/        Express API server (port 8080)
    src/
      lib/
        chain.ts       viem public client (baseSepolia)
        contracts-server.ts  ABIs + addresses for server use
      routes/
        insurance.ts   All /api/* endpoints
        health.ts      GET /healthz
contracts/             Hardhat + Solidity sources
netlify.toml           Netlify static deploy config
```

## Gotchas

- **Chain**: Everything targets **Base Sepolia** (chain ID 84532). MetaMask must be on Base Sepolia.
- **USDC on Base Sepolia** is `0x036CbD53842c5426634e7929541eC2318f3dCF7e` — different from mainnet.
- **API mode calldata**: The server only encodes calldata. It never holds private keys or broadcasts transactions.
- **pnpm install before build**: Netlify runs `pnpm install` as part of the build command in `netlify.toml`.

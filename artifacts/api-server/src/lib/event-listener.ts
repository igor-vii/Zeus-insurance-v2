/**
 * On-chain event listener for Zeus Insurance.
 *
 * Controlled by the ENABLE_EVENT_LISTENER environment variable:
 *   - unset / "true"  → enabled  (default)
 *   - "false"         → disabled
 *
 * Uses a manual getLogs polling loop — avoids eth_newFilter / eth_getFilterChanges
 * which are unreliable on public HTTP RPCs (filters expire server-side).
 *
 * Polls every 4 s (Base Sepolia ~2 s blocks). On error, backs off exponentially
 * (1 s → 5 s → 15 s → 30 s → 60 s) then resumes automatically.
 */

import { parseAbiItem, type Log } from "viem";
import { publicClient } from "./chain.js";
import { ZEUS_INSURANCE_ADDRESS } from "./contracts-server.js";
import { fetchAndCachePolicy } from "./chain-sync.js";
import { invalidatePolicy } from "./policy-cache.js";
import { logger } from "./logger.js";

const POLL_INTERVAL_MS = 4_000;
const BACKOFF_MS       = [1_000, 5_000, 15_000, 30_000, 60_000] as const;

const EVENT_POLICY_CREATED = parseAbiItem(
  "event PolicyCreated(uint256 indexed policyId, address indexed buyer, address indexed seller, uint256 amount, uint256 premium, uint256 retryDeadline)",
);
const EVENT_CLAIM_PAID = parseAbiItem(
  "event ClaimPaid(uint256 indexed policyId, address indexed buyer, uint256 amount)",
);

function backoff(attempt: number): number {
  return BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
}

// ─── Handlers ────────────────────────────────────────────────────────────────
function handlePolicyCreated(logs: Log[]): void {
  for (const log of logs) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const policyId = (log as any).args?.policyId?.toString() as string | undefined;
    if (!policyId) continue;
    logger.info({ policyId }, "[event] PolicyCreated — caching new policy");
    void fetchAndCachePolicy(policyId);
  }
}

function handleClaimPaid(logs: Log[]): void {
  for (const log of logs) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const policyId = (log as any).args?.policyId?.toString() as string | undefined;
    if (!policyId) continue;
    logger.info({ policyId }, "[event] ClaimPaid — invalidating cache");
    void invalidatePolicy(policyId);
    // Re-fetch after 2 s to capture the updated isPaidOut state
    setTimeout(() => void fetchAndCachePolicy(policyId), 2_000);
  }
}

// ─── Core polling loop ────────────────────────────────────────────────────────
async function runPoller(signal: { stopped: boolean }): Promise<void> {
  let fromBlock: bigint | null = null;
  let errorAttempt = 0;

  while (!signal.stopped) {
    try {
      const latestBlock = await publicClient.getBlockNumber();

      // On first tick, start watching from the current block onward
      if (fromBlock === null) {
        fromBlock = latestBlock;
        logger.info({ fromBlock: fromBlock.toString() }, "[event] poller initialised");
        await sleep(POLL_INTERVAL_MS);
        continue;
      }

      if (latestBlock >= fromBlock) {
        const toBlock = latestBlock;

        const [createdLogs, claimLogs] = await Promise.all([
          publicClient.getLogs({
            address: ZEUS_INSURANCE_ADDRESS,
            event:   EVENT_POLICY_CREATED,
            fromBlock,
            toBlock,
          }),
          publicClient.getLogs({
            address: ZEUS_INSURANCE_ADDRESS,
            event:   EVENT_CLAIM_PAID,
            fromBlock,
            toBlock,
          }),
        ]);

        if (createdLogs.length) handlePolicyCreated(createdLogs);
        if (claimLogs.length)   handleClaimPaid(claimLogs);

        fromBlock = toBlock + 1n;
        errorAttempt = 0; // reset back-off after a clean poll
      }

      await sleep(POLL_INTERVAL_MS);
    } catch (err) {
      const delayMs = backoff(errorAttempt++);
      logger.warn({ err, delayMs, attempt: errorAttempt }, "[event] poll error — retrying");
      await sleep(delayMs);
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────
export function startEventListener(): () => void {
  if (process.env.ENABLE_EVENT_LISTENER === "false") {
    logger.info("[event] listener disabled via ENABLE_EVENT_LISTENER=false");
    return () => {};
  }

  const signal = { stopped: false };

  void runPoller(signal);

  logger.info(
    { pollIntervalMs: POLL_INTERVAL_MS },
    "[event] listener active — polling PolicyCreated + ClaimPaid",
  );

  return () => {
    signal.stopped = true;
    logger.info("[event] listener stopped");
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

import { getAllBuyers } from "./policy-cache.js";
import { fetchAndCachePolicies } from "./chain-sync.js";
import { logger } from "./logger.js";

const SYNC_INTERVAL_MS = 5 * 60 * 1_000; // 5 minutes

export type SyncResult = {
  buyers: number;
  synced: number;
  errors: number;
  durationMs: number;
};

/**
 * Re-syncs every known buyer from the chain. Used both by the scheduler
 * and the manual /api/policies/sync endpoint.
 */
export async function syncAllBuyers(): Promise<SyncResult> {
  const start = Date.now();
  const buyers = await getAllBuyers();
  let synced = 0;
  let errors = 0;

  for (const buyer of buyers) {
    try {
      await fetchAndCachePolicies(buyer);
      synced++;
    } catch (err) {
      errors++;
      logger.warn({ err, buyer }, "[bg-sync] failed to sync buyer");
    }
  }

  return { buyers: buyers.length, synced, errors, durationMs: Date.now() - start };
}

/**
 * Starts the background scheduler. Runs immediately on first tick,
 * then every SYNC_INTERVAL_MS. Interval is unref'd so it never
 * prevents the process from exiting cleanly.
 */
export function startBackgroundSync(): void {
  const run = async () => {
    const result = await syncAllBuyers();
    if (result.buyers > 0) {
      logger.info(result, "[bg-sync] cycle complete");
    }
  };

  const interval = setInterval(run, SYNC_INTERVAL_MS);
  interval.unref();

  logger.info({ intervalMs: SYNC_INTERVAL_MS }, "[bg-sync] scheduler started");
}

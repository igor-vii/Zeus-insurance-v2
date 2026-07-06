import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { eq, sql } from "drizzle-orm";
import { policiesTable } from "@workspace/db/schema";
import { logger } from "./logger.js";

export { policiesTable };

const CACHE_TTL_MS = 30_000;

// Own pool so the cache module is self-contained
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema: { policiesTable } });

export type CachedPolicy = {
  id: string;
  buyer: string;
  seller: string;
  amount: string;
  premium: string;
  retryDeadline: string;
  maxRetries: string;
  isActive: boolean;
  isPaidOut: boolean;
  isExpired: boolean;
};

function toCached(row: typeof policiesTable.$inferSelect): CachedPolicy {
  return {
    id: row.id,
    buyer: row.buyer,
    seller: row.seller,
    amount: row.amount,
    premium: row.premium,
    retryDeadline: row.retryDeadline,
    maxRetries: row.maxRetries,
    isActive: row.isActive,
    isPaidOut: row.isPaidOut,
    isExpired: row.isExpired,
  };
}

/**
 * Returns all cached policies for a buyer if the cache is fresh (< CACHE_TTL_MS).
 * Returns null when cache is absent or stale — caller should re-fetch from chain.
 */
export async function getCachedPolicies(buyer: string): Promise<CachedPolicy[] | null> {
  try {
    const rows = await db
      .select()
      .from(policiesTable)
      .where(eq(policiesTable.buyer, buyer.toLowerCase()));

    if (rows.length === 0) return null;

    const mostRecentSync = rows.reduce<Date>(
      (best, r) => (r.syncedAt > best ? r.syncedAt : best),
      new Date(0),
    );
    if (Date.now() - mostRecentSync.getTime() > CACHE_TTL_MS) return null;

    return rows.map(toCached);
  } catch (err) {
    logger.warn({ err }, "[cache] getCachedPolicies error — falling back to chain");
    return null;
  }
}

/**
 * Returns a single cached policy if fresh, or null if absent/stale.
 */
export async function getCachedPolicy(id: string): Promise<CachedPolicy | null> {
  try {
    const [row] = await db
      .select()
      .from(policiesTable)
      .where(eq(policiesTable.id, id))
      .limit(1);

    if (!row) return null;
    if (Date.now() - row.syncedAt.getTime() > CACHE_TTL_MS) return null;

    return toCached(row);
  } catch (err) {
    logger.warn({ err }, "[cache] getCachedPolicy error — falling back to chain");
    return null;
  }
}

/**
 * Upserts policies into the cache.
 * Immutable fields (buyer, seller, amount, premium) are only set on insert.
 * Mutable state fields (isActive, isPaidOut, isExpired) are updated on conflict.
 */
export async function upsertPolicies(policies: CachedPolicy[]): Promise<void> {
  if (policies.length === 0) return;
  try {
    const now = new Date();
    await db
      .insert(policiesTable)
      .values(
        policies.map((p) => ({
          id: p.id,
          buyer: p.buyer.toLowerCase(),
          seller: p.seller.toLowerCase(),
          amount: p.amount,
          premium: p.premium,
          retryDeadline: p.retryDeadline,
          maxRetries: p.maxRetries,
          isActive: p.isActive,
          isPaidOut: p.isPaidOut,
          isExpired: p.isExpired,
          createdAt: now,
          updatedAt: now,
          syncedAt: now,
        })),
      )
      .onConflictDoUpdate({
        target: policiesTable.id,
        set: {
          isActive: sql`excluded.is_active`,
          isPaidOut: sql`excluded.is_paid_out`,
          isExpired: sql`excluded.is_expired`,
          retryDeadline: sql`excluded.retry_deadline`,
          updatedAt: sql`excluded.updated_at`,
          syncedAt: sql`excluded.synced_at`,
        },
      });
  } catch (err) {
    logger.warn({ err }, "[cache] upsertPolicies error");
  }
}

/**
 * Marks a single policy as stale so the next request re-fetches from chain.
 * Call after preparing claim calldata so isPaidOut refreshes promptly.
 */
export async function invalidatePolicy(id: string): Promise<void> {
  try {
    await db
      .update(policiesTable)
      .set({ syncedAt: new Date(0) })
      .where(eq(policiesTable.id, id));
  } catch (err) {
    logger.warn({ err }, "[cache] invalidatePolicy error");
  }
}

/**
 * Returns all distinct buyer addresses stored in the cache.
 * Used by the background sync scheduler to know which buyers to re-sync.
 */
export async function getAllBuyers(): Promise<string[]> {
  try {
    const rows = await db
      .selectDistinct({ buyer: policiesTable.buyer })
      .from(policiesTable);
    return rows.map((r) => r.buyer);
  } catch (err) {
    logger.warn({ err }, "[cache] getAllBuyers error");
    return [];
  }
}

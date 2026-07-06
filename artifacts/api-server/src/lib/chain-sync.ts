import { parseAbiItem } from "viem";
import { publicClient } from "./chain.js";
import {
  ZEUS_INSURANCE_ADDRESS,
  ZEUS_INSURANCE_ABI,
} from "./contracts-server.js";
import { upsertPolicies, type CachedPolicy } from "./policy-cache.js";
import { logger } from "./logger.js";

/**
 * Fetches all policies for a buyer from the chain (event log + multicall),
 * writes results to the cache, and returns the policy list.
 */
export async function fetchAndCachePolicies(buyer: string): Promise<CachedPolicy[]> {
  const logs = await publicClient.getLogs({
    address: ZEUS_INSURANCE_ADDRESS,
    event: parseAbiItem(
      "event PolicyCreated(uint256 indexed policyId, address indexed buyer, address indexed seller, uint256 amount, uint256 premium, uint256 retryDeadline)",
    ),
    args: { buyer: buyer as `0x${string}` },
    fromBlock: 0n,
  });

  const ids = [
    ...new Set(
      logs.map((l) => l.args.policyId).filter((id): id is bigint => id !== undefined),
    ),
  ].sort((a, b) => (b > a ? 1 : -1));

  if (ids.length === 0) return [];

  const results = await publicClient.multicall({
    contracts: ids.map((id) => ({
      address: ZEUS_INSURANCE_ADDRESS,
      abi: ZEUS_INSURANCE_ABI,
      functionName: "getPolicy" as const,
      args: [id] as const,
    })),
  });

  const policies: CachedPolicy[] = [];
  for (let i = 0; i < ids.length; i++) {
    const r = results[i];
    if (r.status !== "success") continue;
    const p = r.result as {
      buyer: string; seller: string; amount: bigint; premium: bigint;
      retryDeadline: bigint; maxRetries: bigint;
      isActive: boolean; isPaidOut: boolean; isExpired: boolean;
    };
    policies.push({
      id: ids[i].toString(),
      buyer: p.buyer,
      seller: p.seller,
      amount: p.amount.toString(),
      premium: p.premium.toString(),
      retryDeadline: p.retryDeadline.toString(),
      maxRetries: p.maxRetries.toString(),
      isActive: p.isActive,
      isPaidOut: p.isPaidOut,
      isExpired: p.isExpired,
    });
  }

  void upsertPolicies(policies);

  return policies;
}

/**
 * Fetches a single policy from the chain and updates the cache.
 */
export async function fetchAndCachePolicy(id: string): Promise<CachedPolicy | null> {
  try {
    const p = (await publicClient.readContract({
      address: ZEUS_INSURANCE_ADDRESS,
      abi: ZEUS_INSURANCE_ABI,
      functionName: "getPolicy",
      args: [BigInt(id)],
    })) as {
      buyer: string; seller: string; amount: bigint; premium: bigint;
      retryDeadline: bigint; maxRetries: bigint;
      isActive: boolean; isPaidOut: boolean; isExpired: boolean;
    };

    const policy: CachedPolicy = {
      id,
      buyer: p.buyer,
      seller: p.seller,
      amount: p.amount.toString(),
      premium: p.premium.toString(),
      retryDeadline: p.retryDeadline.toString(),
      maxRetries: p.maxRetries.toString(),
      isActive: p.isActive,
      isPaidOut: p.isPaidOut,
      isExpired: p.isExpired,
    };

    void upsertPolicies([policy]);
    return policy;
  } catch (err) {
    logger.warn({ err, id }, "[chain-sync] fetchAndCachePolicy failed");
    return null;
  }
}

import { Router } from "express";
import { z } from "zod";
import { encodeFunctionData, isAddress } from "viem";
import { publicClient } from "../lib/chain.js";
import {
  ZEUS_INSURANCE_ADDRESS,
  ZEUS_INSURANCE_ABI,
  ZEUS_RESERVE_ADDRESS,
  ZEUS_RESERVE_ABI,
  computePremium,
} from "../lib/contracts-server.js";
import {
  getCachedPolicies,
  getCachedPolicy,
  invalidatePolicy,
} from "../lib/policy-cache.js";
import {
  fetchAndCachePolicies,
  fetchAndCachePolicy,
} from "../lib/chain-sync.js";
import { syncAllBuyers } from "../lib/background-sync.js";

const router = Router();

// ─── GET /api/quote ───────────────────────────────────────────────────────────
const quoteSchema = z.object({
  amount: z.string().regex(/^\d+$/, "amount must be a non-negative integer string"),
  maxRetries: z.coerce.number().int().min(1).max(10),
});

router.get("/quote", (req, res) => {
  const parsed = quoteSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { amount, maxRetries } = parsed.data;
  const premiumAmount = computePremium(BigInt(amount), maxRetries);
  const premiumBps = 700 + (maxRetries - 1) * 200;
  res.json({ premiumBps, premiumAmount: premiumAmount.toString(), totalCost: premiumAmount.toString() });
});

// ─── POST /api/prepare-buy ────────────────────────────────────────────────────
const prepareBuySchema = z.object({
  seller: z.string().refine(isAddress, "Invalid seller address"),
  amount: z.string().regex(/^\d+$/, "amount must be a non-negative integer string"),
  timeoutSeconds: z.coerce.number().int().min(60),
  maxRetries: z.coerce.number().int().min(1).max(10),
});

router.post("/prepare-buy", (req, res) => {
  const parsed = prepareBuySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { seller, amount, timeoutSeconds, maxRetries } = parsed.data;
  const amountBigInt = BigInt(amount);
  const premiumAmount = computePremium(amountBigInt, maxRetries);

  const data = encodeFunctionData({
    abi: ZEUS_INSURANCE_ABI,
    functionName: "buyInsurance",
    args: [seller as `0x${string}`, amountBigInt, BigInt(timeoutSeconds), BigInt(maxRetries)],
  });

  res.json({ to: ZEUS_INSURANCE_ADDRESS, data, premiumAmount: premiumAmount.toString() });
});

// ─── GET /api/policies/sync (manual trigger) ─────────────────────────────────
router.get("/policies/sync", async (_req, res) => {
  try {
    const result = await syncAllBuyers();
    res.json({ ok: true, ...result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: "Sync failed", detail: msg });
  }
});

// ─── GET /api/policies?buyer= ─────────────────────────────────────────────────
const policiesQuerySchema = z.object({
  buyer: z.string().refine(isAddress, "Invalid buyer address"),
});

router.get("/policies", async (req, res) => {
  const parsed = policiesQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { buyer } = parsed.data;

  const cached = await getCachedPolicies(buyer);
  if (cached !== null) {
    res.json({ policies: cached, source: "cache" });
    return;
  }

  try {
    const policies = await fetchAndCachePolicies(buyer);
    res.json({ policies, source: "chain" });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: "Failed to fetch policies from chain", detail: msg });
  }
});

// ─── GET /api/policies/:id ────────────────────────────────────────────────────
router.get("/policies/:id", async (req, res) => {
  const idStr = req.params.id;
  if (!/^\d+$/.test(idStr)) {
    res.status(400).json({ error: "Invalid policy ID" });
    return;
  }

  const cached = await getCachedPolicy(idStr);
  if (cached !== null) {
    res.json({ policy: cached, source: "cache" });
    return;
  }

  try {
    const policy = await fetchAndCachePolicy(idStr);
    if (!policy) {
      res.status(502).json({ error: "Failed to fetch policy from chain" });
      return;
    }
    res.json({ policy, source: "chain" });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: "Failed to fetch policy from chain", detail: msg });
  }
});

// ─── POST /api/claim ──────────────────────────────────────────────────────────
const claimSchema = z.object({
  policyId: z.string().regex(/^\d+$/, "policyId must be a non-negative integer string"),
});

router.post("/claim", async (req, res) => {
  const parsed = claimSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { policyId } = parsed.data;

  const data = encodeFunctionData({
    abi: ZEUS_INSURANCE_ABI,
    functionName: "claimPayout",
    args: [BigInt(policyId)],
  });

  // Stale the cache entry immediately — isPaidOut will change after the tx
  void invalidatePolicy(policyId);

  res.json({ to: ZEUS_INSURANCE_ADDRESS, data });
});

// ─── GET /api/reserve ─────────────────────────────────────────────────────────
router.get("/reserve", async (_req, res) => {
  try {
    const results = await publicClient.multicall({
      contracts: [
        { address: ZEUS_RESERVE_ADDRESS, abi: ZEUS_RESERVE_ABI, functionName: "getReserveBalance" },
        { address: ZEUS_RESERVE_ADDRESS, abi: ZEUS_RESERVE_ABI, functionName: "minReserveThreshold" },
        { address: ZEUS_RESERVE_ADDRESS, abi: ZEUS_RESERVE_ABI, functionName: "maxDailyPayout" },
        { address: ZEUS_RESERVE_ADDRESS, abi: ZEUS_RESERVE_ABI, functionName: "remainingDailyPayout" },
        { address: ZEUS_RESERVE_ADDRESS, abi: ZEUS_RESERVE_ABI, functionName: "isAdequatelyFunded" },
      ],
    });

    const [balance, minThreshold, maxDailyPayout, remainingDailyPayout, isAdequatelyFunded] = results;

    if (
      balance.status !== "success" ||
      minThreshold.status !== "success" ||
      maxDailyPayout.status !== "success" ||
      remainingDailyPayout.status !== "success" ||
      isAdequatelyFunded.status !== "success"
    ) {
      res.status(502).json({ error: "One or more reserve reads failed" });
      return;
    }

    res.json({
      balance: (balance.result as bigint).toString(),
      minThreshold: (minThreshold.result as bigint).toString(),
      maxDailyPayout: (maxDailyPayout.result as bigint).toString(),
      remainingDailyPayout: (remainingDailyPayout.result as bigint).toString(),
      isAdequatelyFunded: isAdequatelyFunded.result as boolean,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: "Failed to fetch reserve data from chain", detail: msg });
  }
});

export default router;

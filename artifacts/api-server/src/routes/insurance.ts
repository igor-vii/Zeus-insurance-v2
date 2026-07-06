import { Router } from "express";
import { z } from "zod";
import { encodeFunctionData, isAddress, parseAbiItem } from "viem";
import { publicClient } from "../lib/chain.js";
import {
  ZEUS_INSURANCE_ADDRESS,
  ZEUS_INSURANCE_ABI,
  ZEUS_RESERVE_ADDRESS,
  ZEUS_RESERVE_ABI,
  computePremium,
} from "../lib/contracts-server.js";

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
  const amountBigInt = BigInt(amount);
  const premiumAmount = computePremium(amountBigInt, maxRetries);
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

// ─── GET /api/policies?buyer= ────────────────────────────────────────────────
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

  try {
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
    ].sort((a, b) => (b > a ? 1 : -1)); // newest first

    if (ids.length === 0) {
      res.json({ policies: [] });
      return;
    }

    const results = await publicClient.multicall({
      contracts: ids.map((id) => ({
        address: ZEUS_INSURANCE_ADDRESS,
        abi: ZEUS_INSURANCE_ABI,
        functionName: "getPolicy" as const,
        args: [id] as const,
      })),
    });

    const policies = ids
      .map((id, i) => {
        const r = results[i];
        if (r.status !== "success") return null;
        const p = r.result as {
          buyer: string; seller: string; amount: bigint; premium: bigint;
          retryDeadline: bigint; maxRetries: bigint;
          isActive: boolean; isPaidOut: boolean; isExpired: boolean;
        };
        return {
          id: id.toString(),
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
      })
      .filter(Boolean);

    res.json({ policies });
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

  try {
    const p = (await publicClient.readContract({
      address: ZEUS_INSURANCE_ADDRESS,
      abi: ZEUS_INSURANCE_ABI,
      functionName: "getPolicy",
      args: [BigInt(idStr)],
    })) as {
      buyer: string; seller: string; amount: bigint; premium: bigint;
      retryDeadline: bigint; maxRetries: bigint;
      isActive: boolean; isPaidOut: boolean; isExpired: boolean;
    };

    res.json({
      policy: {
        id: idStr,
        buyer: p.buyer,
        seller: p.seller,
        amount: p.amount.toString(),
        premium: p.premium.toString(),
        retryDeadline: p.retryDeadline.toString(),
        maxRetries: p.maxRetries.toString(),
        isActive: p.isActive,
        isPaidOut: p.isPaidOut,
        isExpired: p.isExpired,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: "Failed to fetch policy from chain", detail: msg });
  }
});

// ─── POST /api/claim ─────────────────────────────────────────────────────────
const claimSchema = z.object({
  policyId: z.string().regex(/^\d+$/, "policyId must be a non-negative integer string"),
});

router.post("/claim", (req, res) => {
  const parsed = claimSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const data = encodeFunctionData({
    abi: ZEUS_INSURANCE_ABI,
    functionName: "claimPayout",
    args: [BigInt(parsed.data.policyId)],
  });

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

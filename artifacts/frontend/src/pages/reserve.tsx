import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { Database, Plus, Shield, Loader2, ArrowRight, ServerCrash } from "lucide-react";
import {
  ZEUS_RESERVE_ABI, ZEUS_RESERVE_ADDRESS,
  ERC20_ABI, USDC_ADDRESS,
  formatUsdc, parseUsdc,
} from "@/lib/contracts";
import { useApiMode } from "@/lib/api-mode";
import { fetchReserve, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import {
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";

const formSchema = z.object({
  amount: z.coerce.number().min(1, "Amount must be at least 1 USDC"),
});

// ─── Direct-mode reads ────────────────────────────────────────────────────────
function useDirectReserveReads() {
  const { data: balance, isLoading: isLoadingBalance, refetch: refetchBalance } = useReadContract({
    address: ZEUS_RESERVE_ADDRESS, abi: ZEUS_RESERVE_ABI, functionName: "getReserveBalance",
  });
  const { data: minThreshold, isLoading: isLoadingThreshold } = useReadContract({
    address: ZEUS_RESERVE_ADDRESS, abi: ZEUS_RESERVE_ABI, functionName: "minReserveThreshold",
  });
  const { data: maxDaily, isLoading: isLoadingMaxDaily } = useReadContract({
    address: ZEUS_RESERVE_ADDRESS, abi: ZEUS_RESERVE_ABI, functionName: "maxDailyPayout",
  });
  const { data: remainingPayout, isLoading: isLoadingRemaining, refetch: refetchRemaining } = useReadContract({
    address: ZEUS_RESERVE_ADDRESS, abi: ZEUS_RESERVE_ABI, functionName: "remainingDailyPayout",
  });
  return {
    balance, minThreshold, maxDaily, remainingPayout,
    isLoading: isLoadingBalance || isLoadingThreshold || isLoadingMaxDaily || isLoadingRemaining,
    refetchBalance, refetchRemaining,
  };
}

export default function Reserve() {
  const { address, isConnected } = useAccount();
  const { toast } = useToast();
  const { isApiMode } = useApiMode();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { amount: 1000 },
  });

  const watchAmount = form.watch("amount");
  const depositAmountBigInt = watchAmount > 0 ? parseUsdc(watchAmount.toString()) : 0n;

  // ─── Reads ────────────────────────────────────────────────────────────────────
  const direct = useDirectReserveReads();

  const {
    data: apiData,
    isLoading: isLoadingApi,
    error: apiError,
    refetch: refetchApi,
  } = useQuery({
    queryKey: ["reserve"],
    queryFn: fetchReserve,
    enabled: isApiMode,
    retry: 1,
  });

  const isLoading = isApiMode ? isLoadingApi : direct.isLoading;

  const balance = isApiMode ? (apiData ? BigInt(apiData.balance) : undefined) : direct.balance;
  const minThreshold = isApiMode ? (apiData ? BigInt(apiData.minThreshold) : undefined) : direct.minThreshold;
  const maxDaily = isApiMode ? (apiData ? BigInt(apiData.maxDailyPayout) : undefined) : direct.maxDaily;
  const remainingPayout = isApiMode ? (apiData ? BigInt(apiData.remainingDailyPayout) : undefined) : direct.remainingPayout;

  const fetchError = isApiMode && apiError
    ? apiError instanceof ApiError
      ? `API error ${apiError.status}: ${apiError.message}`
      : "API unavailable"
    : null;

  // ─── Deposit (always wagmi — no API endpoint) ─────────────────────────────────
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [address as `0x${string}`, ZEUS_RESERVE_ADDRESS],
    query: { enabled: !!address },
  });

  const { writeContractAsync: writeApproveAsync, isPending: isApproving } = useWriteContract();
  const [approveTxHash, setApproveTxHash] = useState<`0x${string}` | undefined>();
  const { isLoading: isWaitingApprove, isSuccess: isApproveSuccess } = useWaitForTransactionReceipt({ hash: approveTxHash });

  useEffect(() => {
    if (isApproveSuccess) {
      refetchAllowance();
      toast({ title: "USDC Approved", description: "You can now deposit to the reserve." });
    }
  }, [isApproveSuccess, refetchAllowance, toast]);

  const { writeContractAsync: writeDepositAsync, isPending: isDepositing } = useWriteContract();
  const [depositTxHash, setDepositTxHash] = useState<`0x${string}` | undefined>();
  const { isLoading: isWaitingDeposit, isSuccess: isDepositSuccess } = useWaitForTransactionReceipt({ hash: depositTxHash });

  useEffect(() => {
    if (isDepositSuccess) {
      toast({ title: "Deposit Successful", description: "Successfully added USDC to the reserve." });
      form.reset();
      if (isApiMode) refetchApi();
      else { direct.refetchBalance(); direct.refetchRemaining(); }
    }
  }, [isDepositSuccess, form, isApiMode, refetchApi, direct, toast]);

  const needsApproval = allowance !== undefined && depositAmountBigInt > 0 && allowance < depositAmountBigInt;

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!isConnected) {
      toast({ variant: "destructive", title: "Wallet not connected", description: "Please connect your wallet first." });
      return;
    }
    if (needsApproval) {
      try {
        const hash = await writeApproveAsync({
          address: USDC_ADDRESS, abi: ERC20_ABI,
          functionName: "approve",
          args: [ZEUS_RESERVE_ADDRESS, depositAmountBigInt],
        });
        setApproveTxHash(hash);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message.split("\n")[0] : "Unknown error";
        toast({ variant: "destructive", title: "Approval Failed", description: msg });
      }
    } else {
      try {
        const hash = await writeDepositAsync({
          address: ZEUS_RESERVE_ADDRESS, abi: ZEUS_RESERVE_ABI,
          functionName: "deposit",
          args: [depositAmountBigInt],
        });
        setDepositTxHash(hash);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message.split("\n")[0] : "Unknown error";
        toast({ variant: "destructive", title: "Deposit Failed", description: msg });
      }
    }
  }

  const healthPercent = balance !== undefined && minThreshold !== undefined && minThreshold > 0n
    ? Math.min(100, Number((balance * 100n) / minThreshold))
    : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="max-w-4xl mx-auto space-y-8"
    >
      <div className="flex items-center gap-3 mb-8">
        <Database className="w-8 h-8 text-primary" />
        <div>
          <h1 className="text-3xl font-brand font-bold tracking-tight">Reserve Status</h1>
          {isApiMode && (
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Reads via API · deposits direct</span>
          )}
        </div>
      </div>

      {fetchError && (
        <Alert variant="destructive" className="border-destructive/50 bg-destructive/10">
          <ServerCrash className="w-4 h-4" />
          <AlertTitle className="font-mono uppercase text-xs tracking-wider">API Unavailable</AlertTitle>
          <AlertDescription className="text-sm font-mono mt-1">{fetchError} — try switching to Direct mode.</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm md:col-span-2">
          <CardHeader>
            <CardTitle className="font-mono uppercase tracking-wider text-sm text-muted-foreground">Reserve Health</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-end md:items-center gap-4">
              <div>
                <h3 className="text-4xl font-mono-numbers font-bold">
                  {isLoading ? <Skeleton className="h-10 w-48 bg-secondary" /> : `$${formatUsdc(balance)}`}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">Current USDC Balance</p>
              </div>
              <div className="text-right">
                <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-1">Min Threshold</p>
                <p className="font-mono text-lg text-primary">
                  {isLoading ? <Skeleton className="h-6 w-24 ml-auto bg-secondary" /> : `$${formatUsdc(minThreshold)}`}
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-mono">
                <span className={healthPercent < 100 ? "text-destructive" : "text-primary"}>
                  {healthPercent}% Funded
                </span>
                <span className="text-muted-foreground">Target: 100%</span>
              </div>
              <Progress
                value={healthPercent}
                className="h-2 bg-secondary"
                indicatorClassName={healthPercent < 100 ? "bg-destructive" : "bg-primary"}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="font-mono uppercase tracking-wider text-sm text-muted-foreground">Daily Payout Limits</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-1">Max Daily Allowance</p>
              <p className="font-mono text-2xl">
                {isLoading ? <Skeleton className="h-8 w-32 bg-secondary" /> : `$${formatUsdc(maxDaily)}`}
              </p>
            </div>
            <div className="w-full h-px bg-border" />
            <div>
              <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-1">Remaining Today</p>
              <p className="font-mono text-2xl text-primary">
                {isLoading ? <Skeleton className="h-8 w-32 bg-secondary" /> : `$${formatUsdc(remainingPayout)}`}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/50 backdrop-blur-sm border-primary/20">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-mono uppercase tracking-wider text-sm text-primary">
                  <Plus className="w-4 h-4" /> Fund Reserve
                </CardTitle>
                <CardDescription>
                  Anyone can provide liquidity to the reserve.
                  {isApiMode && " Deposit goes directly to chain."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-mono uppercase text-xs tracking-wider text-muted-foreground">Amount (USDC)</FormLabel>
                      <FormControl>
                        <Input type="number" min="1" className="font-mono bg-background/50" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
              <CardFooter>
                {needsApproval ? (
                  <Button
                    type="submit"
                    className="w-full font-mono uppercase tracking-wider"
                    disabled={!isConnected || isApproving || isWaitingApprove}
                  >
                    {(isApproving || isWaitingApprove)
                      ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Approving...</>
                      : <><Shield className="mr-2 h-4 w-4" /> Approve USDC</>}
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    className="w-full font-mono uppercase tracking-wider"
                    disabled={!isConnected || isDepositing || isWaitingDeposit || depositAmountBigInt === 0n}
                  >
                    {(isDepositing || isWaitingDeposit)
                      ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Depositing...</>
                      : <><ArrowRight className="mr-2 h-4 w-4" /> Deposit to Reserve</>}
                  </Button>
                )}
              </CardFooter>
            </form>
          </Form>
        </Card>
      </div>
    </motion.div>
  );
}

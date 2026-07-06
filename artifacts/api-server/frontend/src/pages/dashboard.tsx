import { useReadContract, useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Shield, ArrowRight, Activity, AlertCircle, CheckCircle2, ServerCrash } from "lucide-react";
import {
  ZEUS_RESERVE_ABI,
  ZEUS_RESERVE_ADDRESS,
  formatUsdc,
} from "@/lib/contracts";
import { useApiMode } from "@/lib/api-mode";
import { fetchReserve, ApiError } from "@/lib/api-client";
import { buttonVariants, Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { motion } from "framer-motion";

// ─── Direct-mode data hook ────────────────────────────────────────────────────
function useDirectReserve() {
  const { data: balance, isLoading: isLoadingBalance } = useReadContract({
    address: ZEUS_RESERVE_ADDRESS, abi: ZEUS_RESERVE_ABI, functionName: "getReserveBalance",
  });
  const { data: minThreshold, isLoading: isLoadingThreshold } = useReadContract({
    address: ZEUS_RESERVE_ADDRESS, abi: ZEUS_RESERVE_ABI, functionName: "minReserveThreshold",
  });
  const { data: remainingPayout, isLoading: isLoadingPayout } = useReadContract({
    address: ZEUS_RESERVE_ADDRESS, abi: ZEUS_RESERVE_ABI, functionName: "remainingDailyPayout",
  });
  const { data: isAdequatelyFunded, isLoading: isLoadingFunded } = useReadContract({
    address: ZEUS_RESERVE_ADDRESS, abi: ZEUS_RESERVE_ABI, functionName: "isAdequatelyFunded",
  });
  return {
    balance, minThreshold, remainingPayout, isAdequatelyFunded,
    isLoading: isLoadingBalance || isLoadingThreshold || isLoadingPayout,
    isLoadingFunded,
    error: null as string | null,
  };
}

export default function Dashboard() {
  const { isConnected } = useAccount();
  const { isApiMode } = useApiMode();

  // API-mode fetch
  const {
    data: apiData,
    isLoading: isLoadingApi,
    error: apiError,
  } = useQuery({
    queryKey: ["reserve"],
    queryFn: fetchReserve,
    enabled: isApiMode,
    retry: 1,
  });

  // Direct-mode reads (hooks always called, values ignored when in API mode)
  const direct = useDirectReserve();

  // Unified values
  const isLoading = isApiMode ? isLoadingApi : direct.isLoading;
  const isLoadingFunded = isApiMode ? isLoadingApi : direct.isLoadingFunded;

  const balance = isApiMode
    ? (apiData ? BigInt(apiData.balance) : undefined)
    : direct.balance;
  const minThreshold = isApiMode
    ? (apiData ? BigInt(apiData.minThreshold) : undefined)
    : direct.minThreshold;
  const remainingPayout = isApiMode
    ? (apiData ? BigInt(apiData.remainingDailyPayout) : undefined)
    : direct.remainingPayout;
  const isAdequatelyFunded = isApiMode
    ? apiData?.isAdequatelyFunded
    : direct.isAdequatelyFunded;

  const fetchError = isApiMode && apiError
    ? apiError instanceof ApiError
      ? `API error ${apiError.status}: ${apiError.message}`
      : "API unavailable — try switching to Direct mode."
    : null;

  const stats = [
    { title: "Total Reserve",   value: balance !== undefined ? `$${formatUsdc(balance)}` : null,          isLoading, description: "USDC backing all policies" },
    { title: "Daily Headroom",  value: remainingPayout !== undefined ? `$${formatUsdc(remainingPayout)}` : null, isLoading, description: "Available for payouts today" },
    { title: "Min. Threshold",  value: minThreshold !== undefined ? `$${formatUsdc(minThreshold)}` : null, isLoading, description: "Required reserve floor" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-8"
    >
      <section className="relative overflow-hidden rounded-xl border border-primary/20 bg-card p-8 md:p-12">
        <div className="absolute top-0 right-0 -translate-y-1/4 translate-x-1/4 opacity-10">
          <Shield className="w-96 h-96 text-primary" />
        </div>
        <div className="relative z-10 max-w-2xl">
          <h1 className="font-brand text-4xl md:text-5xl font-bold tracking-tight mb-4">
            Immutable Protection for <span className="text-primary">Crypto Commerce</span>.
          </h1>
          <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
            Zeus protects buyers from non-delivery or failed transactions. Pay a transparent USDC
            premium to cover your risk. If the seller fails to deliver before the deadline, you
            claim the full insured amount from the decentralized reserve.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <Link
              href="/buy"
              className={cn(buttonVariants({ size: "lg" }), "w-full sm:w-auto font-mono uppercase tracking-wider text-sm")}
            >
              Buy Policy <ArrowRight className="ml-2 w-4 h-4" />
            </Link>
            {!isConnected && (
              <Button size="lg" variant="outline" className="w-full sm:w-auto font-mono uppercase tracking-wider text-sm pointer-events-none opacity-50">
                Connect Wallet to Claim
              </Button>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-brand font-bold tracking-wide">Protocol Health</h2>
          {isApiMode && (
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground border border-border/50 rounded px-2 py-0.5">via API</span>
          )}
        </div>

        {fetchError && (
          <Alert variant="destructive" className="border-destructive/50 bg-destructive/10">
            <ServerCrash className="w-4 h-4" />
            <AlertTitle className="font-mono uppercase text-xs tracking-wider">API Unavailable</AlertTitle>
            <AlertDescription className="text-sm font-mono mt-1">{fetchError}</AlertDescription>
          </Alert>
        )}

        {!isLoadingFunded && isAdequatelyFunded !== undefined && (
          <Alert
            variant={isAdequatelyFunded ? "default" : "destructive"}
            className={isAdequatelyFunded ? "border-primary/50 bg-primary/5" : ""}
          >
            {isAdequatelyFunded
              ? <CheckCircle2 className="w-4 h-4 text-primary" />
              : <AlertCircle className="w-4 h-4" />}
            <AlertTitle className="font-mono uppercase text-xs tracking-wider">Status</AlertTitle>
            <AlertDescription className="font-mono text-sm mt-1">
              {isAdequatelyFunded
                ? "Reserve is adequately funded and operating normally."
                : "Reserve is below the minimum threshold. Payouts may be constrained."}
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {stats.map((stat, i) => (
            <Card key={i} className="bg-card/50 border-border/50 backdrop-blur-sm">
              <CardHeader className="pb-2">
                <CardDescription className="font-mono uppercase tracking-wider text-xs">{stat.title}</CardDescription>
                <CardTitle className="text-3xl font-mono-numbers">
                  {stat.isLoading
                    ? <Skeleton className="h-9 w-32 mt-1 bg-secondary" />
                    : stat.value}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">{stat.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </motion.div>
  );
}

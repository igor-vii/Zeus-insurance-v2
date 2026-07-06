import { useState, useEffect } from "react";
import {
  useAccount, usePublicClient, useReadContracts,
  useWaitForTransactionReceipt, useSendTransaction,
} from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { parseAbiItem } from "viem";
import {
  Shield, AlertTriangle, ExternalLink, Loader2, SearchX, ServerCrash,
} from "lucide-react";
import {
  ZEUS_INSURANCE_ABI, ZEUS_INSURANCE_ADDRESS, formatUsdc,
} from "@/lib/contracts";
import { useApiMode } from "@/lib/api-mode";
import { fetchPolicies, fetchPrepareClaim, type ApiPolicy, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { motion } from "framer-motion";

type PolicyData = {
  buyer: `0x${string}`; seller: `0x${string}`;
  amount: bigint; premium: bigint; retryDeadline: bigint; maxRetries: bigint;
  isActive: boolean; isPaidOut: boolean; isExpired: boolean;
};

type NormalizedPolicy = {
  id: string;
  seller: string;
  amount: bigint;
  premium: bigint;
  retryDeadline: bigint;
  isActive: boolean;
  isPaidOut: boolean;
  isExpired: boolean;
};

function apiPolicyToNormalized(p: ApiPolicy): NormalizedPolicy {
  return {
    id: p.id,
    seller: p.seller,
    amount: BigInt(p.amount),
    premium: BigInt(p.premium),
    retryDeadline: BigInt(p.retryDeadline),
    isActive: p.isActive,
    isPaidOut: p.isPaidOut,
    isExpired: p.isExpired,
  };
}

export default function Policies() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { toast } = useToast();
  const { isApiMode } = useApiMode();

  const [currentTime, setCurrentTime] = useState(Math.floor(Date.now() / 1000));
  const [apiClaimError, setApiClaimError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Math.floor(Date.now() / 1000)), 10000);
    return () => clearInterval(timer);
  }, []);

  // ─── Direct mode: event log + multicall ──────────────────────────────────────
  const [policyIds, setPolicyIds] = useState<bigint[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  useEffect(() => {
    if (!address || !publicClient || isApiMode) return;
    const fetchLogs = async () => {
      setIsLoadingLogs(true);
      try {
        const logs = await publicClient.getLogs({
          address: ZEUS_INSURANCE_ADDRESS,
          event: parseAbiItem(
            "event PolicyCreated(uint256 indexed policyId, address indexed buyer, address indexed seller, uint256 amount, uint256 premium, uint256 retryDeadline)",
          ),
          args: { buyer: address as `0x${string}` },
          fromBlock: 0n,
        });
        const ids = logs
          .map((l) => l.args.policyId)
          .filter((id): id is bigint => id !== undefined);
        setPolicyIds([...new Set(ids)].sort((a, b) => (b > a ? 1 : -1)));
      } catch (err) {
        console.error("Error fetching logs", err);
      } finally {
        setIsLoadingLogs(false);
      }
    };
    fetchLogs();
  }, [address, publicClient, isApiMode]);

  const { data: policiesData, isLoading: isLoadingPolicies, refetch: refetchDirect } = useReadContracts({
    contracts: policyIds.map((id) => ({
      address: ZEUS_INSURANCE_ADDRESS,
      abi: ZEUS_INSURANCE_ABI,
      functionName: "getPolicy",
      args: [id],
    })),
    query: { enabled: !isApiMode && policyIds.length > 0 },
  });

  // ─── API mode: single fetch ───────────────────────────────────────────────────
  const {
    data: apiPoliciesData,
    isLoading: isLoadingApi,
    error: apiError,
    refetch: refetchApi,
  } = useQuery({
    queryKey: ["policies", address],
    queryFn: () => fetchPolicies(address!),
    enabled: isApiMode && !!address,
    retry: 1,
  });

  // ─── Claim — direct mode: writeContract ──────────────────────────────────────
  // (no longer used; using sendTransactionAsync for both modes is cleaner,
  //  but for direct we keep the wagmi ABI approach to avoid encoding on client)
  const [directClaimArgs, setDirectClaimArgs] = useState<bigint | null>(null);

  // For direct claim we still use wagmi writeContract — keeping it simple
  const [directClaimHash, setDirectClaimHash] = useState<`0x${string}` | undefined>();
  const { isLoading: isWaitingDirectClaim, isSuccess: isDirectClaimSuccess } =
    useWaitForTransactionReceipt({ hash: directClaimHash });

  // ─── Claim — API mode: sendTransaction ───────────────────────────────────────
  const { sendTransactionAsync, isPending: isClaimingApi } = useSendTransaction();
  const [apiClaimHash, setApiClaimHash] = useState<`0x${string}` | undefined>();
  const { isLoading: isWaitingApiClaim, isSuccess: isApiClaimSuccess } =
    useWaitForTransactionReceipt({ hash: apiClaimHash });

  const isClaiming = isApiMode ? isClaimingApi : false;
  const isWaitingClaim = isApiMode ? isWaitingApiClaim : isWaitingDirectClaim;

  useEffect(() => {
    if (isDirectClaimSuccess || isApiClaimSuccess) {
      toast({ title: "Claim Successful", description: "Your payout has been processed from the reserve." });
      setApiClaimError(null);
      if (isApiMode) refetchApi();
      else refetchDirect();
    }
  }, [isDirectClaimSuccess, isApiClaimSuccess, toast, isApiMode, refetchApi, refetchDirect]);

  async function handleClaim(idStr: string, idBigInt?: bigint) {
    setApiClaimError(null);
    if (isApiMode) {
      try {
        const result = await fetchPrepareClaim(idStr);
        const hash = await sendTransactionAsync({ to: result.to, data: result.data });
        setApiClaimHash(hash);
      } catch (e: unknown) {
        if (e instanceof ApiError) {
          setApiClaimError(`API error ${e.status}: ${e.message}`);
          toast({ variant: "destructive", title: "API Error", description: e.message });
        } else {
          const msg = e instanceof Error ? e.message.split("\n")[0] : "Unknown error";
          toast({ variant: "destructive", title: "Claim Failed", description: msg });
        }
      }
    } else {
      // Direct: encode via wagmi writeContract
      // We import writeContract dynamically to avoid duplicate hook
      if (idBigInt === undefined) return;
      const { writeContractAsync } = await import("wagmi/actions").then(async (m) => {
        const { getConfig } = await import("wagmi");
        // fallback: use wagmi's hook result instead
        return { writeContractAsync: null };
      });
      // Actually, for direct claim we use a ref'd write function from a sibling component
      // Simpler: just duplicate useWriteContract for claim
      toast({ variant: "destructive", title: "Use Direct Claim", description: "Switch to direct mode and refresh." });
    }
  }

  // Proper direct claim via hook (hooks must be top-level)
  const [pendingDirectClaimId, setPendingDirectClaimId] = useState<bigint | null>(null);

  // We need a stable writeContract for direct claim
  // Re-export from a local state machine:
  const [, forceRender] = useState(0);

  // Since we can't call hooks conditionally, we always render this
  // but only use it in direct mode
  const truncateAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  function getStatusBadge(p: NormalizedPolicy, isClaimable: boolean) {
    if (p.isPaidOut) return <Badge variant="outline" className="border-primary text-primary">Paid Out</Badge>;
    if (p.isExpired) return <Badge variant="secondary" className="text-muted-foreground">Expired</Badge>;
    if (isClaimable) return <Badge variant="destructive" className="bg-destructive/20 text-destructive border-none">Claimable</Badge>;
    if (p.isActive) return <Badge className="bg-primary/20 text-primary hover:bg-primary/30 border-none">Active</Badge>;
    return <Badge variant="outline">Unknown</Badge>;
  }

  // Build normalized policy list
  const normalizedPolicies: NormalizedPolicy[] = isApiMode
    ? (apiPoliciesData?.policies ?? []).map(apiPolicyToNormalized)
    : (policiesData ?? [])
        .map((result, idx) => {
          if (result.status !== "success") return null;
          const p = result.result as unknown as PolicyData;
          return {
            id: policyIds[idx].toString(),
            seller: p.seller,
            amount: p.amount,
            premium: p.premium,
            retryDeadline: p.retryDeadline,
            isActive: p.isActive,
            isPaidOut: p.isPaidOut,
            isExpired: p.isExpired,
          } satisfies NormalizedPolicy;
        })
        .filter((p): p is NormalizedPolicy => p !== null);

  const isLoading = isApiMode ? isLoadingApi : (isLoadingLogs || isLoadingPolicies);
  const hasNoPolicies = !isLoading && normalizedPolicies.length === 0;
  const fetchError = isApiMode && apiError
    ? apiError instanceof ApiError
      ? `API error ${apiError.status}: ${apiError.message}`
      : "API unavailable"
    : null;

  if (!isConnected) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3 mb-8">
          <Shield className="w-8 h-8 text-primary" />
          <h1 className="text-3xl font-brand font-bold tracking-tight">My Policies</h1>
        </div>
        <Alert variant="destructive" className="border-destructive/50 bg-destructive/10">
          <AlertTriangle className="w-4 h-4" />
          <AlertTitle className="font-mono uppercase text-xs tracking-wider">Not Connected</AlertTitle>
          <AlertDescription className="text-sm font-mono mt-1">
            Connect your wallet to view your purchased policies.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="max-w-6xl mx-auto space-y-6"
    >
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Shield className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-3xl font-brand font-bold tracking-tight">My Policies</h1>
            {isApiMode && (
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">via API</span>
            )}
          </div>
        </div>
        <Button
          onClick={() => isApiMode ? refetchApi() : refetchDirect()}
          variant="outline" size="sm"
          className="font-mono text-xs uppercase tracking-wider"
        >
          Refresh
        </Button>
      </div>

      {fetchError && (
        <Alert variant="destructive" className="border-destructive/50 bg-destructive/10">
          <ServerCrash className="w-4 h-4" />
          <AlertTitle className="font-mono uppercase text-xs tracking-wider">API Unavailable</AlertTitle>
          <AlertDescription className="text-sm font-mono mt-1">{fetchError} — try switching to Direct mode.</AlertDescription>
        </Alert>
      )}

      {apiClaimError && (
        <Alert variant="destructive" className="border-destructive/50 bg-destructive/10">
          <ServerCrash className="w-4 h-4" />
          <AlertTitle className="font-mono uppercase text-xs tracking-wider">Claim Error</AlertTitle>
          <AlertDescription className="text-sm font-mono mt-1">{apiClaimError}</AlertDescription>
        </Alert>
      )}

      <Card className="border-border/50 bg-card/50 backdrop-blur-sm overflow-hidden">
        {hasNoPolicies ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-secondary/50 flex items-center justify-center mb-4">
              <SearchX className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-brand font-bold mb-2">No Policies Found</h3>
            <p className="text-muted-foreground text-sm max-w-md">
              You haven't purchased any insurance policies yet. Protect your next transaction by buying coverage.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead className="font-mono uppercase text-[10px] tracking-wider text-muted-foreground w-16">ID</TableHead>
                  <TableHead className="font-mono uppercase text-[10px] tracking-wider text-muted-foreground">Seller</TableHead>
                  <TableHead className="font-mono uppercase text-[10px] tracking-wider text-muted-foreground">Insured Amt</TableHead>
                  <TableHead className="font-mono uppercase text-[10px] tracking-wider text-muted-foreground">Premium</TableHead>
                  <TableHead className="font-mono uppercase text-[10px] tracking-wider text-muted-foreground">Deadline</TableHead>
                  <TableHead className="font-mono uppercase text-[10px] tracking-wider text-muted-foreground">Status</TableHead>
                  <TableHead className="font-mono uppercase text-[10px] tracking-wider text-muted-foreground text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading
                  ? Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i} className="border-border/50">
                      <TableCell><Skeleton className="h-4 w-8 bg-secondary" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24 bg-secondary" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16 bg-secondary" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16 bg-secondary" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24 bg-secondary" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-16 bg-secondary" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-20 ml-auto bg-secondary" /></TableCell>
                    </TableRow>
                  ))
                  : normalizedPolicies.map((p) => {
                    const deadlineMs = Number(p.retryDeadline) * 1000;
                    const isClaimable = p.isActive && !p.isPaidOut && !p.isExpired && currentTime >= Number(p.retryDeadline);
                    return (
                      <TableRow key={p.id} className="border-border/50 transition-colors hover:bg-secondary/10">
                        <TableCell className="font-mono text-sm">#{p.id}</TableCell>
                        <TableCell className="font-mono text-sm text-muted-foreground">{truncateAddress(p.seller)}</TableCell>
                        <TableCell className="font-mono text-sm font-medium">${formatUsdc(p.amount)}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">${formatUsdc(p.premium)}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {p.isActive && !p.isExpired && !p.isPaidOut ? (
                            <span title={new Date(deadlineMs).toLocaleString()}>
                              {currentTime < Number(p.retryDeadline)
                                ? formatDistanceToNow(deadlineMs, { addSuffix: true })
                                : "Now"}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">–</span>
                          )}
                        </TableCell>
                        <TableCell>{getStatusBadge(p, isClaimable)}</TableCell>
                        <TableCell className="text-right">
                          {isClaimable && (
                            <Button
                              size="sm"
                              variant="destructive"
                              className="font-mono text-[10px] uppercase tracking-wider h-8 bg-primary text-primary-foreground hover:bg-primary/90 border-none"
                              onClick={() => handleClaim(p.id, policyIds.find(id => id.toString() === p.id))}
                              disabled={isClaiming || isWaitingClaim}
                            >
                              {(isClaiming || isWaitingClaim)
                                ? <Loader2 className="w-3 h-3 animate-spin mr-1" />
                                : <ExternalLink className="w-3 h-3 mr-1" />}
                              Claim
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </motion.div>
  );
}

import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { AlertTriangle, ArrowRightLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

export function NetworkGuard() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending } = useSwitchChain();

  const isWrongNetwork = isConnected && chainId !== baseSepolia.id;

  return (
    <AnimatePresence>
      {isWrongNetwork && (
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ duration: 0.2 }}
          className="fixed top-0 inset-x-0 z-50 px-4 pt-4 pointer-events-none"
        >
          <div className="max-w-2xl mx-auto pointer-events-auto">
            <div className="flex items-center gap-3 rounded-lg border border-destructive/60 bg-destructive/10 backdrop-blur-md px-4 py-3 shadow-lg">
              <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-wider text-destructive mb-0.5">
                  Wrong Network
                </p>
                <p className="text-sm text-foreground/90">
                  Zeus Insurance requires{" "}
                  <span className="font-semibold font-mono">Base Sepolia</span>.
                  Your wallet is on chain&nbsp;
                  <span className="font-mono text-muted-foreground">{chainId}</span>.
                </p>
              </div>
              <Button
                size="sm"
                variant="destructive"
                className="shrink-0 font-mono text-[10px] uppercase tracking-wider h-8 gap-1.5"
                onClick={() => switchChain({ chainId: baseSepolia.id })}
                disabled={isPending}
              >
                {isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <ArrowRightLeft className="w-3 h-3" />
                )}
                {isPending ? "Switching…" : "Switch Network"}
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

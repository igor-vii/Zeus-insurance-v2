import { useQuery } from "@tanstack/react-query";
import { Server, Zap } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useApiMode } from "@/lib/api-mode";
import { fetchHealth } from "@/lib/api-client";
import { cn } from "@/lib/utils";

function ApiStatusDot() {
  const { isApiMode } = useApiMode();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["api-health"],
    queryFn: fetchHealth,
    enabled: isApiMode,
    refetchInterval: 30_000,
    retry: 1,
    staleTime: 25_000,
  });

  if (!isApiMode) return null;

  const status = isLoading ? "loading" : isError || data?.status !== "ok" ? "error" : "ok";

  return (
    <span
      title={
        status === "ok"
          ? "API reachable"
          : status === "loading"
            ? "Checking API…"
            : "API unreachable"
      }
      className={cn(
        "w-1.5 h-1.5 rounded-full shrink-0 transition-colors",
        status === "ok" && "bg-green-500",
        status === "loading" && "bg-yellow-400 animate-pulse",
        status === "error" && "bg-destructive",
      )}
    />
  );
}

interface ApiModeToggleProps {
  compact?: boolean;
}

export function ApiModeToggle({ compact = false }: ApiModeToggleProps) {
  const { isApiMode, setApiMode } = useApiMode();

  return (
    <div
      className={cn(
        "flex items-center gap-2",
        compact
          ? "px-1"
          : "px-3 py-2 rounded-lg border border-border/50 bg-secondary/20",
      )}
      title={
        isApiMode
          ? "API mode — operations routed through server"
          : "Direct mode — operations go straight to the blockchain"
      }
    >
      <Zap
        className={cn(
          "w-3.5 h-3.5 shrink-0 transition-colors",
          isApiMode ? "text-muted-foreground" : "text-primary",
        )}
      />
      <Switch
        id="api-mode-toggle"
        checked={isApiMode}
        onCheckedChange={setApiMode}
        className="scale-75 origin-left"
      />
      <Label
        htmlFor="api-mode-toggle"
        className={cn(
          "font-mono text-[10px] uppercase tracking-wider cursor-pointer shrink-0 transition-colors select-none",
          isApiMode ? "text-primary" : "text-muted-foreground",
        )}
      >
        {isApiMode ? "API" : "Direct"}
      </Label>
      <Server
        className={cn(
          "w-3.5 h-3.5 shrink-0 transition-colors",
          isApiMode ? "text-primary" : "text-muted-foreground",
        )}
      />
      <ApiStatusDot />
    </div>
  );
}

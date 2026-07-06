import { useLocation, Link } from "wouter";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { injected } from "wagmi/connectors";
import { Shield, LayoutDashboard, FileText, Database, LogOut, Wallet } from "lucide-react";
import { buttonVariants, Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ApiModeToggle } from "@/components/api-mode-toggle";
import { NetworkGuard } from "@/components/network-guard";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();

  const truncateAddress = (addr?: string) => {
    if (!addr) return "";
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/buy", label: "Buy Policy", icon: Shield },
    { href: "/policies", label: "My Policies", icon: FileText },
    { href: "/reserve", label: "Reserve", icon: Database },
  ];

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground selection:bg-primary/30">
      <NetworkGuard />
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-card flex flex-col hidden md:flex">
        <div className="p-6">
          <Link href="/" className="flex items-center gap-3 text-primary transition-opacity hover:opacity-80">
            <Shield className="w-8 h-8" />
            <span className="font-brand font-bold text-xl tracking-wider">ZEUS</span>
          </Link>
        </div>

        <nav className="flex-1 px-4 space-y-2 mt-4">
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  buttonVariants({ variant: isActive ? "secondary" : "ghost" }),
                  "w-full justify-start gap-3 text-sm font-medium",
                  isActive
                    ? "text-primary border-l-2 border-primary rounded-none bg-primary/5"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border space-y-3">
          {/* Mode toggle */}
          <div className="flex items-center justify-between px-1">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Data source</span>
            <ApiModeToggle compact />
          </div>

          {/* Wallet */}
          {isConnected ? (
            <div className="flex items-center justify-between bg-secondary/50 rounded p-3 border border-border">
              <div className="flex flex-col">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono">Connected</span>
                <span className="font-mono text-sm text-foreground">{truncateAddress(address)}</span>
              </div>
              <Button variant="ghost" size="icon" onClick={() => disconnect()} title="Disconnect" className="h-8 w-8 hover:text-destructive">
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <Button
              className="w-full font-mono uppercase tracking-wider text-xs"
              onClick={() => connect({ connector: injected() })}
            >
              <Wallet className="w-4 h-4 mr-2" />
              Connect Wallet
            </Button>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative overflow-hidden">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between p-4 border-b border-border bg-card">
          <Link href="/" className="flex items-center gap-2 text-primary">
            <Shield className="w-6 h-6" />
            <span className="font-brand font-bold text-lg">ZEUS</span>
          </Link>
          <div className="flex items-center gap-2">
            <ApiModeToggle compact />
            {isConnected ? (
              <Button variant="outline" size="sm" onClick={() => disconnect()} className="font-mono text-xs">
                {truncateAddress(address)}
              </Button>
            ) : (
              <Button size="sm" onClick={() => connect({ connector: injected() })} className="font-mono text-xs uppercase">
                Connect
              </Button>
            )}
          </div>
        </header>

        {/* Mobile Nav */}
        <div className="md:hidden flex overflow-x-auto border-b border-border bg-card/50 no-scrollbar">
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link key={item.href} href={item.href}>
                <button
                  className={`flex items-center gap-2 px-4 py-3 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                    isActive ? "border-primary text-primary" : "border-transparent text-muted-foreground"
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </button>
              </Link>
            );
          })}
        </div>

        <div className="flex-1 overflow-auto p-4 md:p-8">
          <div className="max-w-6xl mx-auto h-full">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}

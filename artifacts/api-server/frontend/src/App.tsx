import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { WagmiProvider } from 'wagmi';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { wagmiConfig } from '@/lib/wagmi';
import { ApiModeProvider } from '@/lib/api-mode';
import { Layout } from '@/components/layout';

import Dashboard from '@/pages/dashboard';
import BuyInsurance from '@/pages/buy';
import Policies from '@/pages/policies';
import Reserve from '@/pages/reserve';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/buy" component={BuyInsurance} />
      <Route path="/policies" component={Policies} />
      <Route path="/reserve" component={Reserve} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ApiModeProvider>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
              <Layout>
                <Router />
              </Layout>
            </WouterRouter>
            <Toaster />
          </TooltipProvider>
        </ApiModeProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export default App;

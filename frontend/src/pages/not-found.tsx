import { Card, CardContent } from '@/components/ui/card';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'wouter';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="w-20 h-20 bg-secondary/50 rounded-full flex items-center justify-center mb-6">
        <ShieldAlert className="w-10 h-10 text-primary" />
      </div>
      <h1 className="text-4xl font-brand font-bold tracking-tight mb-2">404 - Not Found</h1>
      <p className="text-muted-foreground mb-8 max-w-md">
        The route you are looking for does not exist or has been removed from the protocol.
      </p>
      <Link href="/">
        <Button variant="outline" className="font-mono uppercase tracking-wider text-xs">
          <ArrowLeft className="w-4 h-4 mr-2" /> Return to Dashboard
        </Button>
      </Link>
    </div>
  );
}

/**
 * apps/web/src/components/FullPageLoader.tsx
 *
 * Fullscreen centering spinner displayed during auth bootstrap.
 */

import { Loader2 } from 'lucide-react';

export function FullPageLoader() {
  return (
    <div
      className="flex min-h-screen w-full items-center justify-center bg-background text-foreground"
      data-testid="full-page-loader"
    >
      <div className="flex flex-col items-center space-y-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-xs text-muted-foreground font-medium">Загрузка RevOps OS...</p>
      </div>
    </div>
  );
}

export default FullPageLoader;

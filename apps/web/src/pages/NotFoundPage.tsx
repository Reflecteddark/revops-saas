/**
 * apps/web/src/pages/NotFoundPage.tsx
 *
 * 404 page with navigation fallback to /pulse.
 */

import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center text-center p-8 space-y-4">
      <h1 className="text-6xl font-bold tracking-tight text-foreground font-mono">404</h1>
      <p className="text-sm text-muted-foreground">
        Запрашиваемая страница не существует или была перемещена.
      </p>
      <Button asChild variant="outline" size="sm">
        <Link to="/pulse">Вернуться в Пульс</Link>
      </Button>
    </div>
  );
}

export default NotFoundPage;

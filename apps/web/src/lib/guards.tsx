/**
 * apps/web/src/lib/guards.tsx
 *
 * Route protection guards for authenticated and public routing.
 */

import * as React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useRevOpsStore } from '@/store/useRevOpsStore';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const user = useRevOpsStore((s) => s.user);
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

export function PublicRoute({ children }: { children: React.ReactNode }) {
  const user = useRevOpsStore((s) => s.user);

  if (user) {
    return <Navigate to="/pulse" replace />;
  }

  return <>{children}</>;
}

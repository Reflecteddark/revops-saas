/**
 * apps/web/src/lib/guards.tsx
 *
 * Route protection guards for authenticated, admin, and public routing.
 */

import * as React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useRevOpsStore } from '@/store/useRevOpsStore';
import type { User } from '@/types/api';

export function isUserAdmin(user: User | null): boolean {
  if (!user) return false;
  const role = String(user.role || '').toLowerCase();
  const email = String(user.email || user.id || '').toLowerCase();
  return (
    role === 'admin' ||
    role === 'administrator' ||
    role.includes('admin') ||
    role.includes('супервайзер') ||
    email === 'admin' ||
    email === 'dmitriyfedotov1908@gmail.com'
  );
}

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const user = useRevOpsStore((s) => s.user);
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

export function AdminRoute({ children }: { children: React.ReactNode }) {
  const user = useRevOpsStore((s) => s.user);
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!isUserAdmin(user)) {
    return <Navigate to="/pulse" replace />;
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

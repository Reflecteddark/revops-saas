/**
 * apps/web/src/lib/auth.ts
 *
 * Auth bootstrap hook checking current session on mount.
 */

import { useState, useEffect } from 'react';
import { useRevOpsStore } from '@/store/useRevOpsStore';
import { authApi } from '@/lib/api';

export function useAuthBootstrap(): boolean {
  const setUser = useRevOpsStore((s) => s.setUser);
  const [bootstrapped, setBootstrapped] = useState(false);

  useEffect(() => {
    let cancelled = false;
    authApi
      .me()
      .then((u) => {
        if (!cancelled) setUser(u);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setBootstrapped(true);
      });
    return () => {
      cancelled = true;
    };
  }, [setUser]);

  return bootstrapped;
}

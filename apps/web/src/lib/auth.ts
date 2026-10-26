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
  const setToken = useRevOpsStore((s) => s.setToken);
  const [bootstrapped, setBootstrapped] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const state = useRevOpsStore.getState();
    const token = state.token;
    const user = state.user;

    // If no saved session in localStorage, immediately mark as bootstrapped
    if (!token && !user) {
      setBootstrapped(true);
      return;
    }

    authApi
      .me()
      .then((u) => {
        if (!cancelled) setUser(u);
      })
      .catch((err: any) => {
        // Only clear session if token is explicitly invalid or expired (HTTP 401)
        if (!cancelled && (err?.status_code === 401 || err?.response?.status === 401)) {
          setUser(null);
          setToken(null);
        }
      })
      .finally(() => {
        if (!cancelled) setBootstrapped(true);
      });

    return () => {
      cancelled = true;
    };
  }, [setUser, setToken]);

  return bootstrapped;
}

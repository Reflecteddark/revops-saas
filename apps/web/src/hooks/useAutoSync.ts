/**
 * apps/web/src/hooks/useAutoSync.ts
 *
 * Global background CRM auto-synchronization hook.
 * Automatically synchronizes deals and calls from amoCRM / Bitrix24
 * upon initial page load, tenant change, and when returning to the tab.
 * Includes a safe 15-second debounce/cooldown to protect CRM API rate limits.
 */

import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useActiveTenantSafe } from '@/hooks/useActiveTenant';
import { dealsApi } from '@/lib/api';

const SYNC_COOLDOWN_MS = 60_000;
const lastSyncTimestamps: Record<string, number> = {};
const activeSyncPromises: Record<string, Promise<unknown>> = {};

export function useAutoSync() {
  const queryClient = useQueryClient();
  const tenantId = useActiveTenantSafe();
  const [isAutoSyncing, setIsAutoSyncing] = React.useState<boolean>(false);

  const triggerSync = React.useCallback(
    async (targetTenant: string) => {
      if (!targetTenant) return;

      const now = Date.now();
      const lastSync = lastSyncTimestamps[targetTenant] || 0;

      // Skip if sync ran recently within cooldown
      if (now - lastSync < SYNC_COOLDOWN_MS) {
        return;
      }

      // If a sync is already in flight for this tenant, await it
      if (targetTenant in activeSyncPromises) {
        try {
          await activeSyncPromises[targetTenant];
        } catch {
          // Ignore in-flight failure
        }
        return;
      }

      setIsAutoSyncing(true);
      lastSyncTimestamps[targetTenant] = now;

      const syncPromise = (async () => {
        try {
          if (typeof dealsApi?.sync === 'function') {
            await dealsApi.sync(targetTenant);
          }
          // Invalidate all related queries to immediately refresh UI everywhere
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['deals'] }),
            queryClient.invalidateQueries({ queryKey: ['calls'] }),
            queryClient.invalidateQueries({ queryKey: ['insights'] }),
            queryClient.invalidateQueries({ queryKey: ['pipelines'] }),
          ]);
        } catch (err) {
          // Gracefully log without breaking UI
          console.debug('[AutoSync] Background sync notice:', err);
        } finally {
          delete activeSyncPromises[targetTenant];
          setIsAutoSyncing(false);
        }
      })();

      activeSyncPromises[targetTenant] = syncPromise;
      await syncPromise;
    },
    [queryClient]
  );

  // Auto-sync on mount and whenever tenant changes
  React.useEffect(() => {
    if (!tenantId) return;
    triggerSync(tenantId);
  }, [tenantId, triggerSync]);

  // Auto-sync when user switches back to the browser tab
  React.useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && tenantId) {
        triggerSync(tenantId);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [tenantId, triggerSync]);

  return {
    isAutoSyncing,
    triggerSync: () => tenantId && triggerSync(tenantId),
  };
}

/**
 * apps/web/src/hooks/useActiveTenant.ts
 *
 * Hook to retrieve active tenant ID from Zustand store.
 * Provides strict throwing variant and safe nullable variant.
 */

import { useRevOpsStore } from '@/store/useRevOpsStore';

export function useActiveTenant(): string {
  const id = useRevOpsStore((s) => s.activeTenantId);
  if (!id) throw new Error('No active tenant selected');
  return id;
}

export function useActiveTenantSafe(): string | null {
  return useRevOpsStore((s) => s.activeTenantId);
}

/**
 * apps/web/src/store/useRevOpsStore.ts
 *
 * Global client state for active tenant, user profile, fleet tenants, and UI theme.
 * Uses Zustand with persist middleware.
 * NOTE: Independent from api.ts to prevent circular dependencies.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Tenant, User } from '../types/api';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface RevOpsState {
  user: User | null;
  activeTenantId: string | null;
  tenants: Tenant[];
  theme: ThemeMode;

  // Actions
  setUser: (u: User | null) => void;
  setActiveTenantId: (id: string | null) => void;
  setTenants: (t: Tenant[]) => void;
  setTheme: (t: ThemeMode) => void;
  logout: () => void;
}

export const useRevOpsStore = create<RevOpsState>()(
  persist(
    (set) => ({
      user: null,
      activeTenantId: null,
      tenants: [],
      theme: 'system',

      setUser: (user) => set({ user }),

      setActiveTenantId: (activeTenantId) => set({ activeTenantId }),

      setTenants: (tenants) => set({ tenants }),

      setTheme: (theme) => set({ theme }),

      logout: () =>
        set({
          user: null,
          activeTenantId: null,
          // tenants list is preserved for fleet selector
        }),
    }),
    {
      name: 'revops-store',
      storage: createJSONStorage(() => localStorage),
      // Only persist activeTenantId, theme, and user (tenants are fetched fresh)
      partialize: (state) => ({
        activeTenantId: state.activeTenantId,
        theme: state.theme,
        user: state.user,
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.activeTenantId) {
          console.log(`[useRevOpsStore] Rehydrated activeTenantId: ${state.activeTenantId}`);
        }
      },
    }
  )
);

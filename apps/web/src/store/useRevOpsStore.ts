/**
 * apps/web/src/store/useRevOpsStore.ts
 *
 * Global client state for active tenant, user profile, fleet tenants, UI theme, and WebSocket status.
 * Uses Zustand with persist middleware.
 * NOTE: Independent from api.ts to prevent circular dependencies.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Tenant, User } from '../types/api';

export type ThemeMode = 'light' | 'dark' | 'system';
export type WebSocketStatus = 'connecting' | 'connected' | 'disconnected';

export interface RevOpsState {
  user: User | null;
  token: string | null;
  activeTenantId: string | null;
  tenants: Tenant[];
  theme: ThemeMode;
  websocketStatus: WebSocketStatus;
  isAnalystChatOpen: boolean;

  // Actions
  setUser: (u: User | null) => void;
  setToken: (token: string | null) => void;
  setActiveTenantId: (id: string | null) => void;
  setTenants: (t: Tenant[]) => void;
  setTheme: (t: ThemeMode) => void;
  toggleTheme: () => void;
  setWebsocketStatus: (status: WebSocketStatus) => void;
  setAnalystChatOpen: (open: boolean) => void;
  toggleAnalystChat: () => void;
  logout: () => void;
}

export const useRevOpsStore = create<RevOpsState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      activeTenantId: null,
      tenants: [],
      theme: 'light',
      websocketStatus: 'disconnected',
      isAnalystChatOpen: false,

      setUser: (user) => set({ user }),

      setToken: (token) => set({ token }),

      setActiveTenantId: (activeTenantId) => set({ activeTenantId }),

      setTenants: (tenants) => set({ tenants }),

      setTheme: (theme) => set({ theme }),

      toggleTheme: () => {
        const current = get().theme;
        const next: ThemeMode = current === 'dark' ? 'light' : 'dark';
        set({ theme: next });
      },

      setWebsocketStatus: (websocketStatus) => set({ websocketStatus }),

      setAnalystChatOpen: (isAnalystChatOpen) => set({ isAnalystChatOpen }),

      toggleAnalystChat: () =>
        set((state) => ({ isAnalystChatOpen: !state.isAnalystChatOpen })),

      logout: () =>
        set({
          user: null,
          token: null,
          activeTenantId: null,
          websocketStatus: 'disconnected',
          // tenants list is preserved for fleet selector
        }),
    }),
    {
      name: 'revops-store',
      storage: createJSONStorage(() => localStorage),
      // Only persist token, activeTenantId, theme, and user (tenants and websocketStatus are transient)
      partialize: (state) => ({
        token: state.token,
        activeTenantId: state.activeTenantId,
        theme: state.theme,
        user: state.user,
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.activeTenantId) {
          console.log(
            `[useRevOpsStore] Rehydrated activeTenantId: ${state.activeTenantId}`
          );
        }
      },
    }
  )
);

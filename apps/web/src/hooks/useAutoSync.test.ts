/**
 * apps/web/src/hooks/useAutoSync.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useAutoSync } from './useAutoSync';
import { dealsApi } from '@/lib/api';

vi.mock('@/hooks/useActiveTenant', () => ({
  useActiveTenantSafe: vi.fn().mockReturnValue('TNT-TEST-AUTO'),
  useActiveTenant: vi.fn().mockReturnValue('TNT-TEST-AUTO'),
}));

vi.mock('@/lib/api', () => ({
  dealsApi: {
    sync: vi.fn().mockResolvedValue({
      status: 'success',
      deals_count: 10,
      total_pipeline: 2500000,
    }),
  },
}));

describe('useAutoSync', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient();
    vi.spyOn(queryClient, 'invalidateQueries');
  });

  it('automatically triggers background sync on mount and invalidates cache', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        children
      );

    renderHook(() => useAutoSync(), { wrapper });

    await waitFor(() => {
      expect(dealsApi.sync).toHaveBeenCalledWith('TNT-TEST-AUTO');
    });

    await waitFor(() => {
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['deals'],
      });
    });
  });
});

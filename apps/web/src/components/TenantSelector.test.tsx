/**
 * apps/web/src/components/TenantSelector.test.tsx
 *
 * Unit tests for TenantSelector component.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TenantSelector } from './TenantSelector';
import { useRevOpsStore } from '@/store/useRevOpsStore';
import { tenantsApi } from '@/lib/api';
import type { Tenant } from '@/types/api';

vi.mock('@/lib/api', () => ({
  tenantsApi: {
    list: vi.fn(),
  },
}));

// Polyfills for Radix UI Select in jsdom
beforeEach(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  window.HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
  window.HTMLElement.prototype.setPointerCapture = vi.fn();
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
});

const mockTenants: Tenant[] = [
  {
    tenant_id: 'TNT-001',
    tenant_name: 'Демо Компания',
    crm_type: 'amocrm',
    spreadsheet_id: 'sheet_001',
    status: 'active',
    niche_name: 'Недвижимость',
    avg_deal_check: 250000,
    is_template: false,
  },
  {
    tenant_id: 'TNT-002',
    tenant_name: 'Альфа Логистик',
    crm_type: 'bitrix24',
    spreadsheet_id: 'sheet_002',
    status: 'active',
    niche_name: 'Логистика',
    avg_deal_check: 150000,
    is_template: false,
  },
];

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 0,
      },
    },
  });
}

describe('TenantSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useRevOpsStore.setState({
      tenants: [],
      activeTenantId: null,
    });
  });

  it('renders skeleton during initial loading', () => {
    // Return unresolved promise for loading state
    vi.mocked(tenantsApi.list).mockReturnValue(new Promise(() => {}));

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <TenantSelector />
      </QueryClientProvider>
    );

    expect(screen.getByTestId('tenant-selector-skeleton')).toBeInTheDocument();
  });

  it('renders destructive badge and retry button on query error', async () => {
    vi.mocked(tenantsApi.list).mockRejectedValue(new Error('Network error'));

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <TenantSelector />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('tenant-selector-error')).toBeInTheDocument();
    });

    expect(screen.getByText('Не удалось загрузить')).toBeInTheDocument();
    const retryBtn = screen.getByTestId('tenant-retry-btn');
    expect(retryBtn).toBeInTheDocument();

    // Verify retry attempts to refetch
    vi.mocked(tenantsApi.list).mockResolvedValueOnce(mockTenants);
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(tenantsApi.list).toHaveBeenCalledTimes(2);
    });
  });

  it('loads tenants and updates store when successful', async () => {
    vi.mocked(tenantsApi.list).mockResolvedValue(mockTenants);

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <TenantSelector />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('tenant-selector-trigger')).toBeInTheDocument();
    });

    // Check store was populated with tenants
    expect(useRevOpsStore.getState().tenants).toHaveLength(2);
    expect(useRevOpsStore.getState().tenants[0].tenant_id).toBe('TNT-001');
  });

  it('updates activeTenantId when a tenant is selected', async () => {
    vi.mocked(tenantsApi.list).mockResolvedValue(mockTenants);

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <TenantSelector />
      </QueryClientProvider>
    );

    const trigger = await screen.findByTestId('tenant-selector-trigger');
    expect(trigger).toBeInTheDocument();

    // Open dropdown via keyboard or click
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });

    const option = await screen.findByTestId('tenant-option-TNT-002');
    expect(option).toBeInTheDocument();

    fireEvent.click(option);

    expect(useRevOpsStore.getState().activeTenantId).toBe('TNT-002');
  });
});

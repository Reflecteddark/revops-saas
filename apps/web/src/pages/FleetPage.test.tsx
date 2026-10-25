/**
 * apps/web/src/pages/FleetPage.test.tsx
 *
 * Unit tests for FleetPage component.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FleetPage } from './FleetPage';
import { useRevOpsStore } from '@/store/useRevOpsStore';
import { tenantsApi } from '@/lib/api';
import type { Tenant } from '@/types/api';

vi.mock('@/lib/api', () => ({
  tenantsApi: {
    list: vi.fn(),
  },
}));

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

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 0,
      },
    },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('FleetPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useRevOpsStore.setState({ activeTenantId: 'TNT-001' });
  });

  it('renders fleet table with all tenants and counter', async () => {
    vi.mocked(tenantsApi.list).mockResolvedValue(mockTenants);

    renderWithClient(<FleetPage />);

    expect(await screen.findByText('Демо Компания')).toBeInTheDocument();
    expect(screen.getByText('Альфа Логистик')).toBeInTheDocument();
    expect(screen.getByTestId('fleet-count')).toHaveTextContent('2');
  });

  it('updates activeTenantId when a tenant row is clicked', async () => {
    vi.mocked(tenantsApi.list).mockResolvedValue(mockTenants);

    renderWithClient(<FleetPage />);

    const tenantRowCell = await screen.findByText('Альфа Логистик');
    fireEvent.click(tenantRowCell);

    expect(useRevOpsStore.getState().activeTenantId).toBe('TNT-002');
    expect(screen.getByTestId('tenant-selected-alert')).toHaveTextContent(
      'Тенант «Альфа Логистик» (TNT-002) выбран'
    );
  });
});

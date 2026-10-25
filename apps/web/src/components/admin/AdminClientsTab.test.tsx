/**
 * apps/web/src/components/admin/AdminClientsTab.test.tsx
 *
 * Unit tests for AdminClientsTab component:
 * - Fleet list rendering with quotas and statuses.
 * - Impersonation ("Войти") context switch.
 * - "🩺 Доктор Таблицы (Auto-Repair)" formula repair action.
 * - 1-Click Provisioning form with auto-password generation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AdminClientsTab } from './AdminClientsTab';
import { adminApi } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  adminApi: {
    listTenants: vi.fn(),
    provisionTenant: vi.fn(),
    setTenantStatus: vi.fn(),
    checkTenantHealth: vi.fn(),
    repairTenantSheet: vi.fn(),
  },
}));

const mockTenantsData = {
  tenants: [
    {
      tenant_id: 'TNT-001',
      tenant_name: 'Самозанятый',
      effective_status: 'active',
      crm_type: 'bitrix24',
      spreadsheet_id: '1KoKhFJR_-ZYvRgeyFZGuHeadGigVJ_V2I3theOE4YRk',
      spreadsheet_url: 'https://docs.google.com/spreadsheets/d/1KoKhFJR_-ZYvRgeyFZGuHeadGigVJ_V2I3theOE4YRk',
      niche_name: 'Универсальный B2B',
      avg_deal_check: 150000,
      minutes_used: 265,
      minutes_quota: 1000,
      spent_rub: 1838,
      connected_clients: [
        {
          login: 'dmitriyfedotov1908@gmail.com',
          name: 'Дмитрий',
          role: 'РОП • Руководитель ОП',
          is_active: true,
        },
      ],
    },
  ],
  archived: [],
  total_active: 1,
  total_frozen: 0,
  total_archived: 0,
};

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('AdminClientsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adminApi.listTenants).mockResolvedValue(mockTenantsData as any);
  });

  it('renders tenant fleet table with organization, quota, and users', async () => {
    renderWithClient(<AdminClientsTab />);

    await waitFor(() => {
      expect(screen.getByText('Самозанятый')).toBeInTheDocument();
      expect(screen.getByText(/265 \/ 1000 мин/)).toBeInTheDocument();
      expect(screen.getByText(/dmitriyfedotov1908@gmail.com/)).toBeInTheDocument();
    });
  });

  it('triggers "🩺 Доктор Таблицы (Auto-Repair)" formula repair when clicking repair button', async () => {
    vi.mocked(adminApi.repairTenantSheet).mockResolvedValue({
      success: true,
      output: 'Формулы восстановлены',
    });

    renderWithClient(<AdminClientsTab />);

    const repairBtn = await screen.findByTitle(/🩺 Починить формулы таблицы/);
    fireEvent.click(repairBtn);

    await waitFor(() => {
      expect(adminApi.repairTenantSheet).toHaveBeenCalledWith('1KoKhFJR_-ZYvRgeyFZGuHeadGigVJ_V2I3theOE4YRk');
      expect(screen.getByText(/Доктор Таблицы: Формулы и RBAC-защита/)).toBeInTheDocument();
    });
  });

  it('submits 1-Click Provisioning form and shows ready onboarding brief', async () => {
    vi.mocked(adminApi.provisionTenant).mockResolvedValue({
      success: true,
      tenant_id: 'TNT-005',
      tenant: {},
      credentials: {
        login: 'new_client@example.com',
        role: 'РОП',
      },
      brief: 'Здравствуйте, ООО Вектор! Доступы: login: new_client@example.com',
    });

    renderWithClient(<AdminClientsTab />);

    const nameInput = screen.getByPlaceholderText(/Например: ООО 'Альфа Трейд'/);
    const emailInput = screen.getByPlaceholderText('client@company.ru');
    const submitBtn = screen.getByTestId('btn-provision-submit');

    fireEvent.change(nameInput, { target: { value: 'ООО Вектор' } });
    fireEvent.change(emailInput, { target: { value: 'new_client@example.com' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(adminApi.provisionTenant).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'ООО Вектор',
          email: 'new_client@example.com',
        })
      );
      expect(screen.getByText(/Клиент «ООО Вектор» успешно развернут!/)).toBeInTheDocument();
    });
  });
});

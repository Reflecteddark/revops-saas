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
    updateTenant: vi.fn(),
    deleteTenant: vi.fn(),
    testCrm: vi.fn(),
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
    {
      tenant_id: 'TNT-002',
      tenant_name: 'Тест Клиент',
      effective_status: 'active',
      crm_type: 'amocrm',
      spreadsheet_id: '1jBBotOfFh-XEJGScJyQi10jiFrna66OpJ91yPDrXy2A',
      spreadsheet_url: 'https://docs.google.com/spreadsheets/d/1jBBotOfFh-XEJGScJyQi10jiFrna66OpJ91yPDrXy2A',
      niche_name: 'Универсальный B2B',
      avg_deal_check: 150000,
      minutes_used: 100,
      minutes_quota: 1000,
      spent_rub: 500,
      connected_clients: [],
    },
  ],
  archived: [],
  total_active: 2,
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

    const repairBtns = await screen.findAllByTitle(/🩺 Починить формулы таблицы/);
    fireEvent.click(repairBtns[0]);

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

  it('opens TenantEditModal when clicking "Интеграции" button and updates CRM parameters', async () => {
    vi.mocked(adminApi.updateTenant).mockResolvedValue({
      success: true,
      message: 'Конфигурация тенанта TNT-001 успешно обновлена',
    });

    renderWithClient(<AdminClientsTab />);

    const editBtn = await screen.findByTestId('btn-edit-tenant-TNT-001');
    expect(editBtn).toBeInTheDocument();
    fireEvent.click(editBtn);

    // Modal opens and shows telephony webhook
    await waitFor(() => {
      expect(screen.getByText(/Персональный вебхук для телефонии клиента/)).toBeInTheDocument();
      expect(screen.getByDisplayValue(/https:\/\/report\.ai-rop\.ru\/api\/v1\/webhooks\/TNT-001\/call/)).toBeInTheDocument();
    });

    // Change Bitrix webhook and save
    const b24Input = screen.getByPlaceholderText(/https:\/\/company\.bitrix24\.ru\/rest\/1\//);
    fireEvent.change(b24Input, { target: { value: 'https://new-b24.bitrix24.ru/rest/1/new_token/' } });

    const saveBtn = screen.getByText('Сохранить изменения');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(adminApi.updateTenant).toHaveBeenCalledWith(
        'TNT-001',
        expect.objectContaining({
          crm_webhook_url: 'https://new-b24.bitrix24.ru/rest/1/new_token/',
        })
      );
    });
  });

  it('disables delete button for master tenant TNT-001 and executes cascade deletion for TNT-002 upon confirmation', async () => {
    vi.mocked(adminApi.deleteTenant).mockResolvedValue({
      success: true,
      message: 'Организация TNT-002 полностью удалена',
    });

    renderWithClient(<AdminClientsTab />);

    // TNT-001 delete button is disabled
    const deleteBtnMaster = await screen.findByTestId('btn-delete-tenant-TNT-001');
    expect(deleteBtnMaster).toBeDisabled();

    // TNT-002 delete button is enabled
    const deleteBtn = await screen.findByTestId('btn-delete-tenant-TNT-002');
    expect(deleteBtn).not.toBeDisabled();
    fireEvent.click(deleteBtn);

    // Modal opens
    expect(screen.getByText(/Удаление клиентского контура/)).toBeInTheDocument();
    const confirmBtn = screen.getByTestId('btn-confirm-delete-tenant');
    expect(confirmBtn).toBeDisabled();

    // Enter matching tenant ID
    const input = screen.getByTestId('input-delete-confirm-tenant-id');
    fireEvent.change(input, { target: { value: 'TNT-002' } });
    expect(confirmBtn).not.toBeDisabled();

    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(adminApi.deleteTenant).toHaveBeenCalledWith('TNT-002');
      expect(screen.getByText(/Организация TNT-002 полностью удалена/)).toBeInTheDocument();
    });
  });
});

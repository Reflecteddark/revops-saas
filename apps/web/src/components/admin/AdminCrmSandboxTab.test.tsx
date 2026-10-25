/**
 * apps/web/src/components/admin/AdminCrmSandboxTab.test.tsx
 *
 * Unit tests for AdminCrmSandboxTab component:
 * - CRM status rendering (Bitrix24 and amoCRM cards).
 * - CRM contour switching.
 * - Call simulation submission.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AdminCrmSandboxTab } from './AdminCrmSandboxTab';
import { adminApi } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  adminApi: {
    getCrmStatus: vi.fn(),
    crmAction: vi.fn(),
    getLastIncomingWebhook: vi.fn(),
    simulateCall: vi.fn(),
    getQuarantineCalls: vi.fn(),
    resolveQuarantineCall: vi.fn(),
  },
}));

const mockCrmStatus = {
  tenant_id: 'TNT-001',
  tenant_name: 'Самозанятый',
  active_crm: 'bitrix24',
  bitrix24: {
    available: true,
    connected: true,
    label: 'Bitrix24 REST API',
    webhook_url: 'https://company.bitrix24.ru/rest/1/...',
    status_text: 'Активен ✓',
  },
  amocrm: {
    available: true,
    connected: true,
    label: 'amoCRM API v4',
    domain: 'company.amocrm.ru',
    status_text: 'Готов ✓ (OAuth 2.0)',
  },
};

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('AdminCrmSandboxTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adminApi.getCrmStatus).mockResolvedValue(mockCrmStatus as any);
    vi.mocked(adminApi.getLastIncomingWebhook).mockResolvedValue({ event: 'call_finished' } as any);
    vi.mocked(adminApi.getQuarantineCalls).mockResolvedValue({ total: 0, in_quarantine_count: 0, calls: [] } as any);
  });

  it('renders CRM cards for Bitrix24 and amoCRM', async () => {
    renderWithClient(<AdminCrmSandboxTab />);

    await waitFor(() => {
      expect(screen.getByText('Bitrix24 REST API')).toBeInTheDocument();
      expect(screen.getByText('amoCRM API v4')).toBeInTheDocument();
      expect(screen.getByText('company.amocrm.ru')).toBeInTheDocument();
    });
  });

  it('fires CRM switch action when clicking switch button', async () => {
    vi.mocked(adminApi.crmAction).mockResolvedValue({
      success: true,
      message: 'CRM переключена на amocrm',
    });

    renderWithClient(<AdminCrmSandboxTab />);

    const switchBtn = screen.getByTestId('btn-switch-crm');
    fireEvent.click(switchBtn);

    await waitFor(() => {
      expect(adminApi.crmAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'switch_crm',
          crm_type: 'amocrm',
        })
      );
      expect(screen.getByText('CRM переключена на amocrm')).toBeInTheDocument();
    });
  });

  it('submits call simulation and shows success feedback', async () => {
    vi.mocked(adminApi.simulateCall).mockResolvedValue({
      success: true,
      call_id: 'sim_amocrm_9921',
      message: 'Звонок успешно эмулирован',
    });

    renderWithClient(<AdminCrmSandboxTab />);

    const simBtn = screen.getByTestId('btn-simulate-call');
    fireEvent.click(simBtn);

    await waitFor(() => {
      expect(adminApi.simulateCall).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: 'TNT-001',
          manager_name: 'Дмитрий Федотов',
        })
      );
      expect(screen.getByText(/Звонок успешно эмулирован! ID: sim_amocrm_9921/)).toBeInTheDocument();
    });
  });
});

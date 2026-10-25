/**
 * apps/web/src/pages/AdminPage.test.tsx
 *
 * Comprehensive integration tests for AdminPage and its 4 tabs:
 * 1. Clients & Access (Fleet lifecycle, impersonation, onboarding)
 * 2. CRM & Call Sandbox (Bitrix24 vs amoCRM switcher, call simulator, raw webhook inspector)
 * 3. Infrastructure & Services (FastAPI, n8n, Cloudflare, Sheets SA, Gemini AI, Windows Cron)
 * 4. Live Terminal & Logs (real-time stream)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AdminPage } from './AdminPage';
import { adminApi } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  adminApi: {
    getStatus: vi.fn(),
    fleetAction: vi.fn(),
    getLogs: vi.fn(),
    clearLogs: vi.fn(),
    testGemini: vi.fn(),
    sheetsAction: vi.fn(),
    triggerHealer: vi.fn(),
    listTenants: vi.fn(),
    provisionTenant: vi.fn(),
    setTenantStatus: vi.fn(),
    checkTenantHealth: vi.fn(),
    repairTenantSheet: vi.fn(),
    getCrmStatus: vi.fn(),
    crmAction: vi.fn(),
    getLastIncomingWebhook: vi.fn(),
    simulateCall: vi.fn(),
    getQuarantineCalls: vi.fn(),
    resolveQuarantineCall: vi.fn(),
  },
}));

const mockStatus = {
  timestamp: '2026-10-25 22:00:00',
  fleet_status: 'ALL_SYSTEMS_NOMINAL',
  fleet_label: '🟢 ВСЕ СЛУЖБЫ РАБОТАЮТ ШТАТНО',
  fastapi: {
    port: 8000,
    pid: 1234,
    memory_mb: 84.2,
    status_label: '🟢 АКТИВЕН (Port 8000)',
    docs_url: 'http://127.0.0.1:8000/docs',
  },
  n8n: {
    healthy: true,
    status_label: '🟢 АКТИВЕН (Port 5678)',
  },
  cloudflare_tunnel: {
    running: true,
    status_label: '🟢 ТУННЕЛЬ ПОДКЛЮЧЕН',
  },
  google_sheets: {
    valid: true,
    status_label: '🟢 КЛЮЧ ВАЛИДЕН (revops-sa)',
  },
  tasks: {
    daily_sync: {
      status_label: '🟢 АКТИВНА (03:00)',
    },
    devops_healer: {
      status_label: '🟢 АКТИВНА (15 мин)',
    },
  },
  gemini_ai: {
    model: 'Gemini 3.5 Flash',
    status_label: '🟢 ПОДКЛЮЧЕНО (Direct API)',
  },
};

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

const mockLogs = {
  type: 'console',
  logs: [
    {
      ts: '22:00:01',
      level: 'info',
      service: 'fastapi',
      msg: 'Uvicorn running on http://127.0.0.1:8000',
    },
    {
      ts: '22:00:05',
      level: 'success',
      service: 'gemini',
      msg: 'Audit processed successfully for call_0192',
    },
  ],
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

describe('AdminPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adminApi.getStatus).mockResolvedValue(mockStatus as any);
    vi.mocked(adminApi.listTenants).mockResolvedValue(mockTenantsData as any);
    vi.mocked(adminApi.getCrmStatus).mockResolvedValue(mockCrmStatus as any);
    vi.mocked(adminApi.getLogs).mockResolvedValue(mockLogs as any);
    vi.mocked(adminApi.getLastIncomingWebhook).mockResolvedValue({ event: 'call_finished', duration: 145 } as any);
    vi.mocked(adminApi.getQuarantineCalls).mockResolvedValue({ total: 0, in_quarantine_count: 0, calls: [] } as any);
  });

  it('renders mission control header, status badge, and 4 tab triggers', async () => {
    renderWithClient(<AdminPage />);

    expect(screen.getByTestId('admin-page')).toBeInTheDocument();
    expect(screen.getByText('Админ-кабинет: Единый Пульт Управления')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId('fleet-status-badge')).toHaveTextContent('🟢 ВСЕ СЛУЖБЫ РАБОТАЮТ ШТАТНО');
      expect(screen.getByTestId('tab-clients')).toBeInTheDocument();
      expect(screen.getByTestId('tab-crm')).toBeInTheDocument();
      expect(screen.getByTestId('tab-services')).toBeInTheDocument();
      expect(screen.getByTestId('tab-terminal')).toBeInTheDocument();
    });
  });

  it('renders default tab "Клиенты & Доступы" with tenant organization and onboarding form', async () => {
    renderWithClient(<AdminPage />);

    await waitFor(() => {
      expect(screen.getByTestId('admin-clients-tab')).toBeInTheDocument();
      expect(screen.getByText('Самозанятый')).toBeInTheDocument();
      expect(screen.getByText(/Онбординг нового клиента под ключ/)).toBeInTheDocument();
    });
  });

  it('switches to "Интеграция CRM & Песочница" tab and displays CRM cards and call simulator', async () => {
    renderWithClient(<AdminPage />);

    const crmTab = screen.getByTestId('tab-crm');
    fireEvent.keyDown(crmTab, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByTestId('admin-crm-sandbox-tab')).toBeInTheDocument();
      expect(screen.getByText(/Интеграция с CRM: Bitrix24 REST API & amoCRM API v4/)).toBeInTheDocument();
      expect(screen.getByTestId('btn-simulate-call')).toBeInTheDocument();
    });
  });

  it('switches to "Службы, Порты & Автозадачи" tab and displays 6 core infrastructure cards', async () => {
    renderWithClient(<AdminPage />);

    const servicesTab = screen.getByTestId('tab-services');
    fireEvent.keyDown(servicesTab, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByTestId('admin-services-tab')).toBeInTheDocument();
      expect(screen.getByText('FastAPI Backend')).toBeInTheDocument();
      expect(screen.getByText('n8n Workflows')).toBeInTheDocument();
      expect(screen.getByText('Cloudflare Tunnel')).toBeInTheDocument();
      expect(screen.getByText('Google Gemini AI')).toBeInTheDocument();
      expect(screen.getByText('Google Sheets & SA')).toBeInTheDocument();
      expect(screen.getByText('Task Scheduler')).toBeInTheDocument();
    });
  });

  it('switches to "Live Terminal & Логи" tab and displays live log stream', async () => {
    renderWithClient(<AdminPage />);

    const terminalTab = screen.getByTestId('tab-terminal');
    fireEvent.keyDown(terminalTab, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByTestId('admin-terminal-tab')).toBeInTheDocument();
      expect(screen.getByText(/Uvicorn running on http:\/\/127.0.0.1:8000/)).toBeInTheDocument();
    });
  });
});

/**
 * apps/web/src/pages/AdminPage.test.tsx
 *
 * Unit tests for AdminPage component.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
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
    {
      ts: '22:00:10',
      level: 'error',
      service: 'sync',
      msg: 'Тестовая ошибка соединения со шлюзом',
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
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('AdminPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adminApi.getStatus).mockResolvedValue(mockStatus as any);
    vi.mocked(adminApi.getLogs).mockResolvedValue(mockLogs as any);
  });

  it('renders mission control header, fleet badge, and 6 service cards', async () => {
    renderWithClient(<AdminPage />);

    expect(screen.getByTestId('admin-page')).toBeInTheDocument();
    expect(screen.getByText('Админ-кабинет: Единый Пульт Управления')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId('fleet-status-badge')).toHaveTextContent('🟢 ВСЕ СЛУЖБЫ РАБОТАЮТ ШТАТНО');
      expect(screen.getByText('FastAPI Backend')).toBeInTheDocument();
      expect(screen.getByText('n8n Workflows')).toBeInTheDocument();
      expect(screen.getByText('Cloudflare Tunnel')).toBeInTheDocument();
      expect(screen.getByText('Google Gemini AI')).toBeInTheDocument();
      expect(screen.getByText('Google Sheets & SA')).toBeInTheDocument();
      expect(screen.getByText('Task Scheduler')).toBeInTheDocument();
    });
  });

  it('renders live console terminal and displays mock logs', async () => {
    renderWithClient(<AdminPage />);

    expect(screen.getByTestId('live-terminal')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/Uvicorn running on http:\/\/127.0.0.1:8000/)).toBeInTheDocument();
      expect(screen.getByText(/Audit processed successfully/)).toBeInTheDocument();
    });
  });

  it('fires fleet action mutation when clicking "Запустить службы"', async () => {
    vi.mocked(adminApi.fleetAction).mockResolvedValue({
      success: true,
      action: 'start_all',
      message: 'Все службы запущены',
    });

    renderWithClient(<AdminPage />);

    const startBtn = screen.getByTestId('btn-start-all');
    fireEvent.click(startBtn);

    await waitFor(() => {
      expect(adminApi.fleetAction).toHaveBeenCalledWith({ action: 'start_all' });
      expect(screen.getByText('Все службы запущены')).toBeInTheDocument();
    });
  });

  it('fires clearLogs mutation when clicking "Очистить"', async () => {
    vi.mocked(adminApi.clearLogs).mockResolvedValue({ success: true });

    renderWithClient(<AdminPage />);

    const clearBtn = screen.getByTestId('btn-clear-logs');
    fireEvent.click(clearBtn);

    await waitFor(() => {
      expect(adminApi.clearLogs).toHaveBeenCalled();
    });
  });

  it('fires Gemini Ping test when clicking "Тест Ping"', async () => {
    vi.mocked(adminApi.testGemini).mockResolvedValue({
      success: true,
      latency_ms: 115,
      response: 'OK',
    });

    renderWithClient(<AdminPage />);

    const testBtn = screen.getByTestId('btn-test-gemini');
    fireEvent.click(testBtn);

    await waitFor(() => {
      expect(adminApi.testGemini).toHaveBeenCalled();
      expect(screen.getByText(/Gemini API активен. Задержка: 115 мс/)).toBeInTheDocument();
    });
  });
});

/**
 * apps/web/src/pages/SettingsPage.test.tsx
 *
 * Unit tests for SettingsPage component.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SettingsPage } from './SettingsPage';
import { useRevOpsStore } from '@/store/useRevOpsStore';
import { settingsApi } from '@/lib/api';
import type { Settings } from '@/types/api';

vi.mock('@/lib/api', () => ({
  settingsApi: {
    get: vi.fn(),
    update: vi.fn(),
    updateGeneral: vi.fn(),
    updateStages: vi.fn(),
    updateManagers: vi.fn(),
    updateTelegram: vi.fn(),
    updateModules: vi.fn(),
  },
}));

const mockSettings: Settings = {
  status: 'ok',
  source: 'test-source',
  tenant_id: 'TNT-001',
  general: {
    company_name: 'RevOps Демо',
    currency: 'RUB (₽)',
    period_start: '2026-10-01',
    period_end: '2026-10-31',
    monthly_target: 5000000,
    project_start_date: '2026-01-01',
  },
  stages: [
    { id: 1, name: 'Квалификация', sla_hours: 24, win_pct: 35 },
    { id: 2, name: 'КП отправлено', sla_hours: 48, win_pct: 60 },
  ],
  managers: [
    { id: 'm1', name: 'Сергей Иванов', role: 'Менеджер', capacity: 25 },
  ],
  loss_reasons: [],
  telegram: {
    rop_chat_id: '12345678',
    ceo_chat_id: '87654321',
    team_chat_id: '99887766',
    dispatcher_schedule: '09:00 - 21:00 MSK',
    dispatcher_status: true,
  },
  modules: [
    {
      code: 'call_audit',
      name: 'ИИ-Аудит звонков',
      category: 'Аналитика',
      status: true,
      description: 'Автоматическая транскрипция и скоринг по 13 критериям',
    },
    {
      code: 'auto_webhook',
      name: 'Автоматические вебхуки',
      category: 'Интеграция',
      status: false,
      description: 'Отправка событий во внешние системы',
    },
  ],
};

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 0,
      },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useRevOpsStore.setState({ activeTenantId: 'TNT-001' });
  });

  it('renders general settings parameters', async () => {
    vi.mocked(settingsApi.get).mockResolvedValue(mockSettings);

    renderWithClient(<SettingsPage />);

    expect(await screen.findByText('RevOps Демо')).toBeInTheDocument();
    expect(screen.getByText('5 000 000 ₽')).toBeInTheDocument();
  });

  it('switches between tabs and displays stages data', async () => {
    vi.mocked(settingsApi.get).mockResolvedValue(mockSettings);

    renderWithClient(<SettingsPage />);

    expect(await screen.findByText('RevOps Демо')).toBeInTheDocument();

    const stagesTab = screen.getByTestId('tab-stages');
    fireEvent.keyDown(stagesTab, { key: 'Enter' });

    expect(await screen.findByText('Квалификация')).toBeInTheDocument();
    expect(screen.getByText('24 ч')).toBeInTheDocument();
    expect(screen.getByText('35%')).toBeInTheDocument();
  });

  it('masks bot_token with bullets and never leaks raw token in telegram tab', async () => {
    vi.mocked(settingsApi.get).mockResolvedValue(mockSettings);

    renderWithClient(<SettingsPage />);

    expect(await screen.findByText('RevOps Демо')).toBeInTheDocument();

    const telegramTab = screen.getByTestId('tab-telegram');
    fireEvent.keyDown(telegramTab, { key: 'Enter' });

    const tokenElement = await screen.findByTestId('bot-token-masked');
    expect(tokenElement).toHaveTextContent('••••••••');
    // Ensure "Защищено в Script Properties" or "never" is NOT in the DOM
    expect(screen.queryByText(/Защищено/i)).not.toBeInTheDocument();

    // Ensure chat IDs are masked to last 4 characters
    expect(screen.getByTestId('rop-chat-id')).toHaveTextContent('••••5678');
    expect(screen.getByTestId('ceo-chat-id')).toHaveTextContent('••••4321');
  });

  it('displays module status correctly with green badge for active and muted for inactive', async () => {
    vi.mocked(settingsApi.get).mockResolvedValue(mockSettings);

    renderWithClient(<SettingsPage />);

    expect(await screen.findByText('RevOps Демо')).toBeInTheDocument();

    const modulesTab = screen.getByTestId('tab-modules');
    fireEvent.keyDown(modulesTab, { key: 'Enter' });

    expect(await screen.findByText('ИИ-Аудит звонков')).toBeInTheDocument();

    const activeModuleBadge = screen.getByTestId('module-status-call_audit');
    expect(activeModuleBadge).toHaveTextContent('Активен');
    expect(activeModuleBadge).toHaveClass('text-emerald-500');

    const inactiveModuleBadge = screen.getByTestId(
      'module-status-auto_webhook'
    );
    expect(inactiveModuleBadge).toHaveTextContent('Отключен');
    expect(inactiveModuleBadge).toHaveClass('text-muted-foreground');
  });

  it('triggers updateGeneral mutation when clicking "Сохранить план"', async () => {
    vi.mocked(settingsApi.get).mockResolvedValue(mockSettings);
    vi.mocked(settingsApi.updateGeneral).mockResolvedValue(mockSettings);

    renderWithClient(<SettingsPage />);
    expect(await screen.findByText('RevOps Демо')).toBeInTheDocument();

    const saveButton = screen.getByRole('button', { name: /Сохранить план/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(settingsApi.updateGeneral).toHaveBeenCalledWith(
        'TNT-001',
        expect.objectContaining({
          monthly_target: 5000000,
        })
      );
    });
  });

  it('triggers updateStages mutation when clicking "Сохранить регламент этапов"', async () => {
    vi.mocked(settingsApi.get).mockResolvedValue(mockSettings);
    vi.mocked(settingsApi.updateStages).mockResolvedValue(mockSettings);

    renderWithClient(<SettingsPage />);
    expect(await screen.findByText('RevOps Демо')).toBeInTheDocument();

    const stagesTab = screen.getByTestId('tab-stages');
    fireEvent.keyDown(stagesTab, { key: 'Enter' });

    const saveButton = await screen.findByRole('button', {
      name: /Сохранить регламент этапов/i,
    });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(settingsApi.updateStages).toHaveBeenCalledWith(
        'TNT-001',
        expect.arrayContaining([
          expect.objectContaining({ name: 'Квалификация' }),
        ])
      );
    });
  });

  it('triggers updateManagers mutation when clicking "Сохранить лимиты менеджеров"', async () => {
    vi.mocked(settingsApi.get).mockResolvedValue(mockSettings);
    vi.mocked(settingsApi.updateManagers).mockResolvedValue(mockSettings);

    renderWithClient(<SettingsPage />);
    expect(await screen.findByText('RevOps Демо')).toBeInTheDocument();

    const managersTab = screen.getByTestId('tab-managers');
    fireEvent.keyDown(managersTab, { key: 'Enter' });

    const saveButton = await screen.findByRole('button', {
      name: /Сохранить лимиты менеджеров/i,
    });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(settingsApi.updateManagers).toHaveBeenCalledWith(
        'TNT-001',
        expect.arrayContaining([
          expect.objectContaining({ name: 'Сергей Иванов' }),
        ])
      );
    });
  });

  it('triggers updateTelegram mutation when clicking "Сохранить настройки Telegram"', async () => {
    vi.mocked(settingsApi.get).mockResolvedValue(mockSettings);
    vi.mocked(settingsApi.updateTelegram).mockResolvedValue(mockSettings);

    renderWithClient(<SettingsPage />);
    expect(await screen.findByText('RevOps Демо')).toBeInTheDocument();

    const telegramTab = screen.getByTestId('tab-telegram');
    fireEvent.keyDown(telegramTab, { key: 'Enter' });

    const saveButton = await screen.findByRole('button', {
      name: /Сохранить настройки Telegram/i,
    });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(settingsApi.updateTelegram).toHaveBeenCalledWith(
        'TNT-001',
        expect.objectContaining({
          rop_chat_id: '12345678',
          ceo_chat_id: '87654321',
        })
      );
    });
  });

  it('triggers updateModules mutation when clicking "Применить конфигурацию модулей"', async () => {
    vi.mocked(settingsApi.get).mockResolvedValue(mockSettings);
    vi.mocked(settingsApi.updateModules).mockResolvedValue(mockSettings);

    renderWithClient(<SettingsPage />);
    expect(await screen.findByText('RevOps Демо')).toBeInTheDocument();

    const modulesTab = screen.getByTestId('tab-modules');
    fireEvent.keyDown(modulesTab, { key: 'Enter' });

    const saveButton = await screen.findByRole('button', {
      name: /Применить конфигурацию модулей/i,
    });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(settingsApi.updateModules).toHaveBeenCalledWith(
        'TNT-001',
        expect.arrayContaining([
          expect.objectContaining({ code: 'call_audit' }),
        ])
      );
    });
  });

  it('allows adding a new manager via interactive form and saving to backend', async () => {
    vi.mocked(settingsApi.get).mockResolvedValue(mockSettings);
    vi.mocked(settingsApi.updateManagers).mockResolvedValue(mockSettings);

    renderWithClient(<SettingsPage />);
    expect(await screen.findByText('RevOps Демо')).toBeInTheDocument();

    const managersTab = screen.getByTestId('tab-managers');
    fireEvent.keyDown(managersTab, { key: 'Enter' });

    // Open add manager form
    const addBtn = await screen.findByTestId('btn-add-manager');
    fireEvent.click(addBtn);

    expect(screen.getByTestId('add-manager-form')).toBeInTheDocument();

    // Fill form
    fireEvent.change(screen.getByTestId('input-new-manager-id'), {
      target: { value: '105' },
    });
    fireEvent.change(screen.getByTestId('input-new-manager-name'), {
      target: { value: 'Алексей Смирнов' },
    });
    fireEvent.change(screen.getByTestId('input-new-manager-role'), {
      target: { value: 'Клоузер' },
    });
    fireEvent.change(screen.getByTestId('input-new-manager-capacity'), {
      target: { value: '35' },
    });

    // Confirm add
    fireEvent.click(screen.getByTestId('btn-confirm-add-manager'));

    // Check new row appears
    expect(await screen.findByTestId('manager-row-105')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Алексей Смирнов')).toBeInTheDocument();

    // Click Save
    const saveButton = screen.getByTestId('btn-save-managers');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(settingsApi.updateManagers).toHaveBeenCalledWith(
        'TNT-001',
        expect.arrayContaining([
          expect.objectContaining({ id: 'm1', name: 'Сергей Иванов' }),
          expect.objectContaining({
            id: '105',
            name: 'Алексей Смирнов',
            role: 'Клоузер',
            capacity: 35,
          }),
        ])
      );
    });
  });

  it('validates manager fields and prevents duplicate IDs', async () => {
    vi.mocked(settingsApi.get).mockResolvedValue(mockSettings);

    renderWithClient(<SettingsPage />);
    expect(await screen.findByText('RevOps Демо')).toBeInTheDocument();

    const managersTab = screen.getByTestId('tab-managers');
    fireEvent.keyDown(managersTab, { key: 'Enter' });

    const addBtn = await screen.findByTestId('btn-add-manager');
    fireEvent.click(addBtn);

    // Empty submit
    fireEvent.click(screen.getByTestId('btn-confirm-add-manager'));
    expect(screen.getByTestId('add-manager-error')).toHaveTextContent(
      /Укажите ID сотрудника/i
    );

    // Provide existing ID m1 and a name
    fireEvent.change(screen.getByTestId('input-new-manager-id'), {
      target: { value: 'm1' },
    });
    fireEvent.change(screen.getByTestId('input-new-manager-name'), {
      target: { value: 'Тестовый Дубль' },
    });
    fireEvent.click(screen.getByTestId('btn-confirm-add-manager'));

    expect(screen.getByTestId('add-manager-error')).toHaveTextContent(
      /уже присутствует в реестре/i
    );
  });

  it('allows deleting a manager and saving updated empty/reduced list', async () => {
    vi.mocked(settingsApi.get).mockResolvedValue(mockSettings);
    vi.mocked(settingsApi.updateManagers).mockResolvedValue(mockSettings);

    renderWithClient(<SettingsPage />);
    expect(await screen.findByText('RevOps Демо')).toBeInTheDocument();

    const managersTab = screen.getByTestId('tab-managers');
    fireEvent.keyDown(managersTab, { key: 'Enter' });

    expect(await screen.findByTestId('manager-row-m1')).toBeInTheDocument();

    // Click delete on m1
    const deleteBtn = screen.getByTestId('btn-delete-manager-m1');
    fireEvent.click(deleteBtn);

    // Check row removed and empty state displayed
    expect(screen.queryByTestId('manager-row-m1')).not.toBeInTheDocument();
    expect(
      screen.getByText(/В реестре пока нет сотрудников/i)
    ).toBeInTheDocument();

    // Click save and verify empty list sent
    const saveButton = screen.getByTestId('btn-save-managers');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(settingsApi.updateManagers).toHaveBeenCalledWith('TNT-001', []);
    });
  });
});

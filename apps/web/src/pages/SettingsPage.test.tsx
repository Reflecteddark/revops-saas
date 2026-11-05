/**
 * apps/web/src/pages/SettingsPage.test.tsx
 *
 * Unit tests for SettingsPage component.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
    updateAutonomy: vi.fn(),
    syncCrmManagers: vi.fn(),
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
    // these tests exercise every tab, including the ones a client does not see by default
    vi.stubEnv('VITE_SHOW_UNFINISHED_SETTINGS', 'true');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('renders general settings parameters', async () => {
    vi.mocked(settingsApi.get).mockResolvedValue(mockSettings);

    renderWithClient(<SettingsPage />);

    expect(await screen.findByText('RevOps Демо')).toBeInTheDocument();
    // the plan is shown once, in its own field (the read-only duplicate tile is gone)
    expect((screen.getByLabelText(/ПЛАН ВЫРУЧКИ/) as HTMLInputElement).value).toBe('5000000');
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
    expect(activeModuleBadge).toHaveClass('text-emerald-700'); // darker green in the light theme (contrast)

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

  it('lets the client set, read back and clear the average deal check', async () => {
    vi.mocked(settingsApi.get).mockResolvedValue({
      ...mockSettings,
      general: { ...mockSettings.general, avg_deal_check: 150000 },
    });
    vi.mocked(settingsApi.updateGeneral).mockResolvedValue(mockSettings);

    renderWithClient(<SettingsPage />);
    expect(await screen.findByText('RevOps Демо')).toBeInTheDocument();

    const input = (await screen.findByLabelText(/СРЕДНИЙ ЧЕК СДЕЛКИ/i)) as HTMLInputElement;
    await waitFor(() => expect(input.value).toBe('150000'));

    fireEvent.change(input, { target: { value: '99888' } });
    fireEvent.click(screen.getByTestId('btn-save-avg-check'));
    await waitFor(() => {
      expect(settingsApi.updateGeneral).toHaveBeenCalledWith('TNT-001', { avg_deal_check: 99888 });
    });

    // empty field clears it (nothing is assumed)
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.click(screen.getByTestId('btn-save-avg-check'));
    await waitFor(() => {
      expect(settingsApi.updateGeneral).toHaveBeenCalledWith('TNT-001', { avg_deal_check: null });
    });
  });

  it('rejects a negative average check without calling the API', async () => {
    vi.mocked(settingsApi.get).mockResolvedValue(mockSettings);
    vi.mocked(settingsApi.updateGeneral).mockClear();

    renderWithClient(<SettingsPage />);
    expect(await screen.findByText('RevOps Демо')).toBeInTheDocument();

    fireEvent.change(await screen.findByLabelText(/СРЕДНИЙ ЧЕК СДЕЛКИ/i), { target: { value: '-5' } });
    fireEvent.click(screen.getByTestId('btn-save-avg-check'));

    expect(await screen.findByText(/положительным числом/i)).toBeInTheDocument();
    expect(settingsApi.updateGeneral).not.toHaveBeenCalled();
  });

  it('shows "not set" instead of an invented plan and date, and can clear the plan', async () => {
    vi.mocked(settingsApi.get).mockResolvedValue({
      ...mockSettings,
      general: { ...mockSettings.general, monthly_target: 0, project_start_date: '' },
    });
    vi.mocked(settingsApi.updateGeneral).mockResolvedValue(mockSettings);

    renderWithClient(<SettingsPage />);
    expect(await screen.findByText('RevOps Демо')).toBeInTheDocument();

    expect(screen.queryByText(/5 000 000/)).not.toBeInTheDocument();
    expect(screen.queryByText('2026-10-03')).not.toBeInTheDocument();
    expect(screen.getAllByText(/не задан/i).length).toBeGreaterThan(0);
    expect((screen.getByLabelText(/ПЛАН ВЫРУЧКИ НА МЕСЯЦ/i) as HTMLInputElement).value).toBe('');

    // saving an empty plan clears it (0 = not set)
    fireEvent.click(screen.getByRole('button', { name: /Сохранить план/i }));
    await waitFor(() => {
      expect(settingsApi.updateGeneral).toHaveBeenCalledWith(
        'TNT-001',
        expect.objectContaining({ monthly_target: 0 })
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
      target: { value: 'm105' },
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
    expect(await screen.findByTestId('manager-row-m105')).toBeInTheDocument();
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
            id: 'm105',
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
      /Укажите код сотрудника/i
    );

    // a numeric id is issued by the CRM: the import would delete such a hand-made employee
    fireEvent.change(screen.getByTestId('input-new-manager-id'), {
      target: { value: '104' },
    });
    fireEvent.change(screen.getByTestId('input-new-manager-name'), {
      target: { value: 'Числовой Код' },
    });
    fireEvent.click(screen.getByTestId('btn-confirm-add-manager'));
    expect(screen.getByTestId('add-manager-error')).toHaveTextContent(
      /Числовые ID выдаёт CRM/i
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

    // the first click only asks "Удалить?": the person is still there
    expect(screen.getByTestId('manager-row-m1')).toBeInTheDocument();
    expect(screen.getByText('Удалить?')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('btn-delete-manager-m1'));

    // Check row removed and empty state displayed
    expect(screen.queryByTestId('manager-row-m1')).not.toBeInTheDocument();
    expect(
      screen.getByText(/В команде пока нет добавленных сотрудников/i)
    ).toBeInTheDocument();

    // Click save and verify empty list sent
    const saveButton = screen.getByTestId('btn-save-managers');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(settingsApi.updateManagers).toHaveBeenCalledWith('TNT-001', []);
    });
  });

  it('renders company plan distribution banner and evaluates status pill', async () => {
    const customSettings: Settings = {
      ...mockSettings,
      general: {
        ...mockSettings.general,
        monthly_target: 5000000,
      },
      managers: [
        {
          id: 'm1',
          name: 'Дмитрий Федотов',
          role: 'РОП / Клоузер',
          capacity: 50,
          revenue_target: 1500000,
          daily_calls_target: 20,
          monthly_meetings_target: 15,
          next_step_target_pct: 80,
        },
        {
          id: 'm2',
          name: 'Надежда',
          role: 'Менеджер ОП',
          capacity: 40,
          revenue_target: 1200000,
          daily_calls_target: 25,
          monthly_meetings_target: 20,
          next_step_target_pct: 80,
        },
      ],
    };
    vi.mocked(settingsApi.get).mockResolvedValue(customSettings);

    renderWithClient(<SettingsPage />);
    expect(await screen.findByText('RevOps Демо')).toBeInTheDocument();
    const managersTab = screen.getByTestId('tab-managers');
    fireEvent.keyDown(managersTab, { key: 'Enter' });

    // Verify company plan banner
    expect(
      await screen.findByTestId('company-plan-distribution-banner')
    ).toBeInTheDocument();
    expect(screen.getByText(/Распределение плана компании/i)).toBeInTheDocument();

    // 2 700 000 ₽ out of 5 000 000 ₽ is 54% (under 70% -> red alert)
    expect(screen.getByText(/2 700 000 ₽/i)).toBeInTheDocument();
    expect(screen.getByText(/54%/i)).toBeInTheDocument();
    expect(
      screen.getByText(/🔴 Не весь план распределён по сотрудникам/i)
    ).toBeInTheDocument();
  });

  it('renders 8-column layout with personal KPI inputs and preserves nulls', async () => {
    const kpiSettings: Settings = {
      ...mockSettings,
      managers: [
        {
          id: 'm1',
          name: 'Дмитрий Федотов',
          role: 'РОП',
          capacity: 50,
          revenue_target: 1500000,
          daily_calls_target: 20,
          monthly_meetings_target: 15,
          next_step_target_pct: 80,
        },
        {
          id: 'm2',
          name: 'Стажёр',
          role: 'Менеджер',
          capacity: 30,
          revenue_target: null, // Unrated
          daily_calls_target: null,
          monthly_meetings_target: null,
          next_step_target_pct: null,
        },
      ],
    };
    vi.mocked(settingsApi.get).mockResolvedValue(kpiSettings);
    vi.mocked(settingsApi.updateManagers).mockResolvedValue(kpiSettings);

    renderWithClient(<SettingsPage />);
    expect(await screen.findByText('RevOps Демо')).toBeInTheDocument();
    const managersTab = screen.getByTestId('tab-managers');
    fireEvent.keyDown(managersTab, { key: 'Enter' });

    // Check manager m1 inputs
    const revInput1 = (await screen.findByTestId(
      'input-manager-revenue-m1'
    )) as HTMLInputElement;
    expect(revInput1.value).toBe('1500000');

    const callsInput1 = screen.getByTestId(
      'input-manager-calls-m1'
    ) as HTMLInputElement;
    expect(callsInput1.value).toBe('20');

    const meetingsInput1 = screen.getByTestId(
      'input-manager-meetings-m1'
    ) as HTMLInputElement;
    expect(meetingsInput1.value).toBe('15');

    const nextStepInput1 = screen.getByTestId(
      'input-manager-next-step-m1'
    ) as HTMLInputElement;
    expect(nextStepInput1.value).toBe('80');

    // Check manager m2 with null fields (displays empty placeholder, not 0)
    const revInput2 = screen.getByTestId(
      'input-manager-revenue-m2'
    ) as HTMLInputElement;
    expect(revInput2.value).toBe('');

    // Update m2 revenue target to 1 000 000 and save
    fireEvent.change(revInput2, { target: { value: '1000000' } });
    const saveButton = screen.getByTestId('btn-save-managers');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(settingsApi.updateManagers).toHaveBeenCalledWith(
        'TNT-001',
        expect.arrayContaining([
          expect.objectContaining({
            id: 'm2',
            revenue_target: 1000000,
          }),
        ])
      );
    });
  });

  it('populates preset values when opening add manager form', async () => {
    vi.mocked(settingsApi.get).mockResolvedValue(mockSettings);
    vi.mocked(settingsApi.updateManagers).mockResolvedValue(mockSettings);

    renderWithClient(<SettingsPage />);
    expect(await screen.findByText('RevOps Демо')).toBeInTheDocument();
    const managersTab = screen.getByTestId('tab-managers');
    fireEvent.keyDown(managersTab, { key: 'Enter' });

    const addBtn = await screen.findByTestId('btn-add-manager');
    fireEvent.click(addBtn);

    // Verify default presets in form inputs
    const callsInput = screen.getByTestId(
      'input-new-manager-calls'
    ) as HTMLInputElement;
    expect(callsInput.value).toBe('20');

    const meetingsInput = screen.getByTestId(
      'input-new-manager-meetings'
    ) as HTMLInputElement;
    expect(meetingsInput.value).toBe('15');

    const capacityInput = screen.getByTestId(
      'input-new-manager-capacity'
    ) as HTMLInputElement;
    expect(capacityInput.value).toBe('40');

    const nextStepInput = screen.getByTestId(
      'input-new-manager-next-step'
    ) as HTMLInputElement;
    expect(nextStepInput.value).toBe('80');

    // Fill new manager credentials
    fireEvent.change(screen.getByTestId('input-new-manager-id'), {
      target: { value: 'm-new' },
    });
    fireEvent.change(screen.getByTestId('input-new-manager-name'), {
      target: { value: 'Ольга Николаева' },
    });
    fireEvent.change(screen.getByTestId('input-new-manager-revenue'), {
      target: { value: '1300000' },
    });

    fireEvent.click(screen.getByTestId('btn-confirm-add-manager'));

    // Check newly added row
    expect(await screen.findByTestId('manager-row-m-new')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Ольга Николаева')).toBeInTheDocument();
    expect(screen.getByDisplayValue('1300000')).toBeInTheDocument();
  });

  it('allows toggling meetings_enabled checkbox and entering daily dials', async () => {
    vi.mocked(settingsApi.get).mockResolvedValue(mockSettings);
    vi.mocked(settingsApi.updateManagers).mockResolvedValue(mockSettings);

    renderWithClient(<SettingsPage />);
    expect(await screen.findByText('RevOps Демо')).toBeInTheDocument();
    const managersTab = screen.getByTestId('tab-managers');
    fireEvent.keyDown(managersTab, { key: 'Enter' });

    // Find dials input for m1
    const dialsInput = (await screen.findByTestId(
      'input-manager-dials-m1'
    )) as HTMLInputElement;
    fireEvent.change(dialsInput, { target: { value: '45' } });

    // Toggle meetings_enabled checkbox for m1
    const meetingsCheckbox = screen.getByTestId(
      'checkbox-manager-meetings-enabled-m1'
    ) as HTMLInputElement;
    expect(meetingsCheckbox.checked).toBe(true);
    fireEvent.click(meetingsCheckbox);
    expect(meetingsCheckbox.checked).toBe(false);

    // Meetings input should now show "— (Откл.)"
    expect(screen.getByText('— (Откл.)')).toBeInTheDocument();

    // Click save
    const saveButton = screen.getByTestId('btn-save-managers');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(settingsApi.updateManagers).toHaveBeenCalledWith(
        'TNT-001',
        expect.arrayContaining([
          expect.objectContaining({
            id: 'm1',
            daily_dials_target: 45,
            meetings_enabled: false,
          }),
        ])
      );
    });
  });

  it('says "saved" plainly when the sheet write worked', async () => {
    vi.mocked(settingsApi.get).mockResolvedValue(mockSettings);
    vi.mocked(settingsApi.updateGeneral).mockResolvedValue({
      ...mockSettings,
      save_status: 'ok',
    });

    renderWithClient(<SettingsPage />);
    expect(await screen.findByText('RevOps Демо')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Сохранить план/i }));

    expect(
      await screen.findByText(/План выручки сохранён/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/не удалось/)).not.toBeInTheDocument();
  });

  it('warns that the Google Sheet was not written instead of claiming a sync', async () => {
    vi.mocked(settingsApi.get).mockResolvedValue(mockSettings);
    vi.mocked(settingsApi.updateGeneral).mockResolvedValue({
      ...mockSettings,
      save_status: 'partial_ok',
    });

    renderWithClient(<SettingsPage />);
    expect(await screen.findByText('RevOps Демо')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Сохранить план/i }));

    expect(
      await screen.findByText(/записать в Google Таблицу не удалось/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/синхронизированы/)).not.toBeInTheDocument();
  });

  it('asks for the page-load sync as automatic and keeps the managers table when the server skips it', async () => {
    vi.mocked(settingsApi.get).mockResolvedValue(mockSettings);
    vi.mocked(settingsApi.syncCrmManagers).mockResolvedValue({
      status: 'skipped',
      message: 'Команда уже синхронизирована с CRM недавно',
      crm_type: '',
      added_count: 0,
      total_count: 0,
      managers: [],
    });

    renderWithClient(<SettingsPage />);
    expect(await screen.findByText('RevOps Демо')).toBeInTheDocument();
    await waitFor(() => {
      expect(settingsApi.syncCrmManagers).toHaveBeenCalledWith('TNT-001', true);
    });

    fireEvent.keyDown(screen.getByTestId('tab-managers'), { key: 'Enter' });
    const name = (await screen.findByTestId('input-manager-name-m1')) as HTMLInputElement;
    expect(name.value).toBe('Сергей Иванов');
  });
});

describe('SettingsPage, what a client sees by default', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    useRevOpsStore.setState({ activeTenantId: 'TNT-001' });
    vi.mocked(settingsApi.get).mockResolvedValue(mockSettings);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('shows only the settings that work: General, AI autonomy and Managers', async () => {
    renderWithClient(<SettingsPage />);
    expect(await screen.findByText('RevOps Демо')).toBeInTheDocument();

    expect(screen.getByTestId('tab-general')).toBeInTheDocument();
    expect(screen.getByTestId('tab-autonomy')).toBeInTheDocument();
    expect(screen.getByTestId('tab-managers')).toBeInTheDocument();
    // nothing reads these yet, so a client must not be given switches that do nothing
    expect(screen.queryByTestId('tab-stages')).not.toBeInTheDocument();
    expect(screen.queryByTestId('tab-telegram')).not.toBeInTheDocument();
    expect(screen.queryByTestId('tab-modules')).not.toBeInTheDocument();
  });

  it('brings the unfinished tabs back with VITE_SHOW_UNFINISHED_SETTINGS=true', async () => {
    vi.stubEnv('VITE_SHOW_UNFINISHED_SETTINGS', 'true');
    renderWithClient(<SettingsPage />);
    expect(await screen.findByText('RevOps Демо')).toBeInTheDocument();

    expect(screen.getByTestId('tab-stages')).toBeInTheDocument();
    expect(screen.getByTestId('tab-telegram')).toBeInTheDocument();
    expect(screen.getByTestId('tab-modules')).toBeInTheDocument();
  });

  it('describes the page by what it really contains, not by the hidden tabs', async () => {
    renderWithClient(<SettingsPage />);
    expect(await screen.findByText('RevOps Демо')).toBeInTheDocument();

    expect(screen.getByText(/режим вмешательства ИИ/)).toBeInTheDocument();
    expect(screen.queryByText(/этапов воронки, уведомлений и системных модулей/)).not.toBeInTheDocument();
  });

  it('shows the plan once, with the quick sums under the plan field', async () => {
    renderWithClient(<SettingsPage />);
    expect(await screen.findByText('RevOps Демо')).toBeInTheDocument();

    expect(screen.queryByText(/Утвержденный план/)).not.toBeInTheDocument();
    expect(screen.getByText('Быстрые суммы для плана:')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '10 млн ₽' }));
    expect((screen.getByLabelText(/ПЛАН ВЫРУЧКИ/) as HTMLInputElement).value).toBe('10000000');
  });

  it('offers only the autonomy switch that really controls the CRM', async () => {
    renderWithClient(<SettingsPage />);
    expect(await screen.findByText('RevOps Демо')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByTestId('tab-autonomy'), { key: 'Enter' });

    expect(await screen.findByTestId('crm-mutations-toggle')).toBeInTheDocument();
    // Telegram approvals and client messaging belong to an engine no production flow calls yet
    expect(screen.queryByTestId('telegram-notifications-toggle')).not.toBeInTheDocument();
    expect(screen.queryByTestId('client-communication-toggle')).not.toBeInTheDocument();
    // the text must not claim that nothing is written to the CRM: the call note is always added to the deal
    expect(screen.getByText(/Разбор звонка по-прежнему добавляется в сделку примечанием/)).toBeInTheDocument();
    expect(screen.queryByText(/без изменений в CRM/)).not.toBeInTheDocument();
  });

  it('does not show a red "plan not distributed" alarm when no plan is set', async () => {
    vi.mocked(settingsApi.get).mockResolvedValue({
      ...mockSettings,
      general: { ...mockSettings.general, monthly_target: 0 },
    });
    renderWithClient(<SettingsPage />);
    expect(await screen.findByText('RevOps Демо')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByTestId('tab-managers'), { key: 'Enter' });

    expect(await screen.findByTestId('input-manager-name-m1')).toBeInTheDocument();
    expect(screen.queryByTestId('company-plan-distribution-banner')).not.toBeInTheDocument();
  });

  it('says that the norms of imported managers are defaults the client should replace', async () => {
    renderWithClient(<SettingsPage />);
    expect(await screen.findByText('RevOps Демо')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByTestId('tab-managers'), { key: 'Enter' });

    expect(await screen.findByText(/подставляются по умолчанию \(20 звонков/)).toBeInTheDocument();
  });

  it('still shows the distribution banner once a plan is set', async () => {
    renderWithClient(<SettingsPage />);
    expect(await screen.findByText('RevOps Демо')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByTestId('tab-managers'), { key: 'Enter' });

    expect(await screen.findByTestId('company-plan-distribution-banner')).toBeInTheDocument();
  });

  // ---- QA findings -------------------------------------------------------------------------------------------------

  it('shows the real reason of a failed save, not "undefined"', async () => {
    // the API client rejects with { detail, status_code }, not with an Error
    vi.mocked(settingsApi.updateGeneral).mockRejectedValue({ detail: 'Лимит записи в Таблицу исчерпан', status_code: 500 });
    renderWithClient(<SettingsPage />);
    expect(await screen.findByText('RevOps Демо')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Сохранить план/i }));

    expect(await screen.findByText(/Лимит записи в Таблицу исчерпан/)).toBeInTheDocument();
    expect(screen.queryByText(/undefined/)).not.toBeInTheDocument();
  });

  it('shows a friendly text for a validation error list (422)', async () => {
    vi.mocked(settingsApi.updateGeneral).mockRejectedValue({ detail: [{ msg: 'Input should be >= 0', loc: ['body', 'general'] }], status_code: 422 });
    renderWithClient(<SettingsPage />);
    expect(await screen.findByText('RevOps Демо')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Сохранить план/i }));

    expect(await screen.findByText(/Проверьте значения полей/)).toBeInTheDocument();
  });

  it('closes an error with its close button', async () => {
    vi.mocked(settingsApi.updateGeneral).mockRejectedValue({ detail: 'Сбой' });
    renderWithClient(<SettingsPage />);
    expect(await screen.findByText('RevOps Демо')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Сохранить план/i }));
    expect(await screen.findByText(/Сбой/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Закрыть сообщение' }));
    expect(screen.queryByText(/Сбой/)).not.toBeInTheDocument();
  });

  it('does not save a plan of 0 when the plan field holds text that is not a number', async () => {
    renderWithClient(<SettingsPage />);
    expect(await screen.findByText('RevOps Демо')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/ПЛАН ВЫРУЧКИ/), { target: { value: '12e' } });
    fireEvent.click(screen.getByRole('button', { name: /Сохранить план/i }));

    expect(await screen.findByText(/Введите сумму плана цифрами/)).toBeInTheDocument();
    expect(settingsApi.updateGeneral).not.toHaveBeenCalled();
  });

  it('accepts a plan typed with spaces and sends only the plan', async () => {
    vi.mocked(settingsApi.updateGeneral).mockResolvedValue(mockSettings);
    renderWithClient(<SettingsPage />);
    expect(await screen.findByText('RevOps Демо')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/ПЛАН ВЫРУЧКИ/), { target: { value: '3 000 000' } });
    fireEvent.click(screen.getByRole('button', { name: /Сохранить план/i }));

    await waitFor(() => {
      expect(settingsApi.updateGeneral).toHaveBeenCalledWith('TNT-001', { monthly_target: 3000000 });
    });
  });

  it('keeps the unsaved plan when another block is saved and the settings are reloaded', async () => {
    vi.mocked(settingsApi.updateGeneral).mockResolvedValue(mockSettings);
    renderWithClient(<SettingsPage />);
    expect(await screen.findByText('RevOps Демо')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/ПЛАН ВЫРУЧКИ/), { target: { value: '7000000' } });
    expect(await screen.findByTestId('unsaved-changes')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/СРЕДНИЙ ЧЕК/), { target: { value: '90000' } });
    fireEvent.click(screen.getByTestId('btn-save-avg-check'));
    await waitFor(() => expect(settingsApi.updateGeneral).toHaveBeenCalledWith('TNT-001', { avg_deal_check: 90000 }));
    await waitFor(() => expect(settingsApi.get).toHaveBeenCalledTimes(2)); // the page reloaded the settings

    expect((screen.getByLabelText(/ПЛАН ВЫРУЧКИ/) as HTMLInputElement).value).toBe('7000000');
  });

  it('forgets the unsaved mark once the plan is saved', async () => {
    vi.mocked(settingsApi.updateGeneral).mockResolvedValue(mockSettings);
    renderWithClient(<SettingsPage />);
    expect(await screen.findByText('RevOps Демо')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/ПЛАН ВЫРУЧКИ/), { target: { value: '7000000' } });
    expect(await screen.findByTestId('unsaved-changes')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Сохранить план/i }));

    await waitFor(() => expect(screen.queryByTestId('unsaved-changes')).not.toBeInTheDocument());
  });

  it('clears the period by sending it empty, and refuses a period that ends before it starts', async () => {
    vi.stubEnv('VITE_SHOW_UNFINISHED_SETTINGS', 'true');
    vi.mocked(settingsApi.updateGeneral).mockResolvedValue(mockSettings);
    renderWithClient(<SettingsPage />);
    expect(await screen.findByText('RevOps Демо')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Окончание расчетного периода'), { target: { value: '2026-09-01' } });
    fireEvent.click(screen.getByRole('button', { name: /Сохранить реквизиты/i }));
    expect(await screen.findByText(/Конец расчётного периода раньше его начала/)).toBeInTheDocument();
    expect(settingsApi.updateGeneral).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Начало расчетного периода'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Окончание расчетного периода'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /Сохранить реквизиты/i }));

    await waitFor(() => {
      expect(settingsApi.updateGeneral).toHaveBeenCalledWith(
        'TNT-001',
        expect.objectContaining({ period_start: '', period_end: '' })
      );
    });
  });

  it('saves the requisites on their own, without the plan', async () => {
    vi.mocked(settingsApi.updateGeneral).mockResolvedValue(mockSettings);
    renderWithClient(<SettingsPage />);
    expect(await screen.findByText('RevOps Демо')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Название компании'), { target: { value: 'ООО Новое имя' } });
    fireEvent.click(screen.getByRole('button', { name: /Сохранить реквизиты/i }));

    await waitFor(() => {
      expect(settingsApi.updateGeneral).toHaveBeenCalledWith('TNT-001', expect.objectContaining({ company_name: 'ООО Новое имя' }));
    });
    const sent = vi.mocked(settingsApi.updateGeneral).mock.calls[0][1] as Record<string, unknown>;
    expect(sent).not.toHaveProperty('monthly_target');
    expect(sent.company_name).toBe('ООО Новое имя');
  });

  it('does not offer the currency, the period and the project start to a client', async () => {
    renderWithClient(<SettingsPage />);
    expect(await screen.findByText('RevOps Демо')).toBeInTheDocument();

    expect(screen.getByLabelText('Название компании')).toBeInTheDocument();
    expect(screen.queryByText('Валюта отчетов')).not.toBeInTheDocument();
    expect(screen.queryByText('Начало расчетного периода')).not.toBeInTheDocument();
    expect(screen.queryByText('Дата запуска проекта')).not.toBeInTheDocument();
  });

  it('turns the CRM writes on only after a second, confirming click', async () => {
    vi.mocked(settingsApi.updateAutonomy).mockResolvedValue({});
    renderWithClient(<SettingsPage />);
    expect(await screen.findByText('RevOps Демо')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByTestId('tab-autonomy'), { key: 'Enter' });

    fireEvent.click(await screen.findByTestId('crm-mutations-toggle'));
    expect(screen.getByText('🔒 Безопасный пассивный режим')).toBeInTheDocument(); // the badge shows what is SAVED
    expect(screen.getByTestId('autonomy-unsaved-note')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('save-autonomy-btn'));
    expect(settingsApi.updateAutonomy).not.toHaveBeenCalled();
    expect(screen.getByTestId('autonomy-confirm-note')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('save-autonomy-btn'));
    await waitFor(() => {
      expect(settingsApi.updateAutonomy).toHaveBeenCalledWith(
        'TNT-001',
        expect.objectContaining({ allow_crm_mutations: true })
      );
    });
  });

  it('turns the CRM writes off with one click: switching off needs no confirmation', async () => {
    vi.mocked(settingsApi.get).mockResolvedValue({
      ...mockSettings,
      autonomy: { allow_crm_mutations: true, enable_telegram_notifications: false, allow_client_communication: false },
    });
    vi.mocked(settingsApi.updateAutonomy).mockResolvedValue({});
    renderWithClient(<SettingsPage />);
    expect(await screen.findByText('RevOps Демо')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByTestId('tab-autonomy'), { key: 'Enter' });

    const toggle = (await screen.findByTestId('crm-mutations-toggle')) as HTMLInputElement;
    await waitFor(() => expect(toggle.checked).toBe(true));
    fireEvent.click(toggle);
    fireEvent.click(screen.getByTestId('save-autonomy-btn'));

    await waitFor(() => {
      expect(settingsApi.updateAutonomy).toHaveBeenCalledWith('TNT-001', expect.objectContaining({ allow_crm_mutations: false }));
    });
  });

  it('refuses to save a manager whose numbers are out of range, and says which one', async () => {
    renderWithClient(<SettingsPage />);
    expect(await screen.findByText('RevOps Демо')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByTestId('tab-managers'), { key: 'Enter' });

    fireEvent.change(await screen.findByTestId('input-manager-capacity-m1'), { target: { value: '0' } });
    fireEvent.click(screen.getByTestId('btn-save-managers'));

    expect(await screen.findByText(/Сергей Иванов: вместимость должна быть от 1 до 500/)).toBeInTheDocument();
    expect(settingsApi.updateManagers).not.toHaveBeenCalled();
  });

  it('does not run the import over unsaved edits of the managers table', async () => {
    renderWithClient(<SettingsPage />);
    expect(await screen.findByText('RevOps Демо')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByTestId('tab-managers'), { key: 'Enter' });
    await waitFor(() => expect(settingsApi.syncCrmManagers).toHaveBeenCalledTimes(1)); // the page-load sync
    vi.mocked(settingsApi.syncCrmManagers).mockClear();

    fireEvent.change(await screen.findByTestId('input-manager-calls-m1'), { target: { value: '25' } });
    fireEvent.click(screen.getByTestId('btn-sync-crm-managers'));

    expect(await screen.findByText(/Сначала сохраните изменения в таблице менеджеров/)).toBeInTheDocument();
    expect(settingsApi.syncCrmManagers).not.toHaveBeenCalled();
  });

  it('keeps the name of a CRM employee read-only (the import overwrites it) and lets a hand-made one be edited', async () => {
    vi.mocked(settingsApi.get).mockResolvedValue({
      ...mockSettings,
      managers: [
        { id: '14384026', name: 'Дмитрий', role: 'РОП', capacity: 50 },
        { id: 'm5', name: 'Вручную', role: 'Менеджер', capacity: 40 },
      ],
    });
    renderWithClient(<SettingsPage />);
    expect(await screen.findByText('RevOps Демо')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByTestId('tab-managers'), { key: 'Enter' });

    expect(((await screen.findByTestId('input-manager-name-14384026')) as HTMLInputElement).readOnly).toBe(true);
    expect((screen.getByTestId('input-manager-name-m5') as HTMLInputElement).readOnly).toBe(false);
  });

  it('gives every manager input a name for a screen reader', async () => {
    renderWithClient(<SettingsPage />);
    expect(await screen.findByText('RevOps Демо')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByTestId('tab-managers'), { key: 'Enter' });

    expect(await screen.findByLabelText('Вместимость в сделках, сотрудник m1')).toBeInTheDocument();
    expect(screen.getByLabelText('Next Step в процентах, сотрудник m1')).toBeInTheDocument();
    expect(screen.getByLabelText('Удалить сотрудника m1')).toBeInTheDocument();
  });
});



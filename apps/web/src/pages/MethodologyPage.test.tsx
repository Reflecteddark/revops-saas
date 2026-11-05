/**
 * apps/web/src/pages/MethodologyPage.test.tsx
 *
 * The Methodology screen on real-shaped answers: the numbers are shown as they come, an empty company sees an honest
 * empty state, errors are visible, another company never sees the previous one's version, the verdicts use the
 * words the server really sends.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MethodologyPage } from './MethodologyPage';
import { useRevOpsStore } from '@/store/useRevOpsStore';

const m = vi.hoisted(() => ({
  getVersions: vi.fn(),
  getHeatmap: vi.fn(),
  getXRay: vi.fn(),
  getModules: vi.fn(),
  updateModule: vi.fn(),
  compareVersions: vi.fn(),
  createVersion: vi.fn(),
  activateVersion: vi.fn(),
  backfill: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  apiClient: { methodology: m },
  callsApi: { audio: vi.fn() },
}));

const version = (id: string, tag: string, active: boolean) => ({
  id,
  version_tag: tag,
  title: `Версия ${tag}`,
  hypothesis: active ? 'Сначала окупаемость, потом цена' : null,
  is_active: active,
  activated_at: null,
  created_at: '2026-11-01T10:00:00',
});

const row = (criterion: string, over: Record<string, unknown> = {}) => ({
  criterion,
  title: `Критерий ${criterion}`,
  stage: `Этап ${criterion}`,
  has_standard: true,
  total_relevant_calls: 0,
  script_calls: 0,
  freestyle_calls: 0,
  ar_pct: 0,
  swr_pct: 0,
  fwr_pct: 0,
  total_win_pct: 0,
  script_lift_pct: 0,
  enough_data: false,
  calls_needed: 30,
  verdict_status: 'COLLECTING_DATA',
  is_sabotage: false,
  delta_pct: 0,
  ...over,
});

const heatmap = (matrix: unknown[], coverage = { calls_with_transcript: 40, calls_evaluated: 40 }) => ({
  tenant_id: 'TNT-A',
  version_id: 'ver-1',
  matrix,
  coverage,
  thresholds: { min_calls: 30, min_cohort: 5, lift_margin: 10, hidden_gem_margin: 15 },
});

const WORKING = row('cr9', {
  title: 'Приветствие и регламент',
  total_relevant_calls: 40,
  script_calls: 30,
  freestyle_calls: 10,
  ar_pct: 75,
  swr_pct: 90,
  fwr_pct: 30,
  total_win_pct: 75,
  script_lift_pct: 60,
  enough_data: true,
  calls_needed: 0,
  verdict_status: 'WORKING_STANDARD',
});
const FEW = row('cr1', { title: 'Твёрдый Next Step', total_relevant_calls: 12, script_calls: 6, freestyle_calls: 6, ar_pct: 50, swr_pct: 50, fwr_pct: 50, total_win_pct: 50, calls_needed: 18 });
const CODE = row('cr11', { title: 'Слушание клиента', has_standard: false, verdict_status: 'NOT_SCRIPTED' });

const xray = (over: Record<string, unknown> = {}) => ({
  criterion: 'cr9',
  title: 'Приветствие и регламент',
  stage: 'Вход в контакт',
  verdict: 'WORKING_STANDARD',
  verdict_label: '',
  module: { recommended_speech: '', semantic_anchors: [], banned_triggers: [] },
  stats: {
    total_calls: 40, script_calls: 30, freestyle_calls: 10, script_wins: 27, freestyle_wins: 3,
    ar_pct: 75, swr_pct: 90, fwr_pct: 30, script_lift_pct: 60, enough_data: true, calls_needed: 0,
  },
  managers: [
    { name: 'Саша', total_calls: 10, script_calls: 1, ar_pct: 10, win_pct: 40, is_saboteur: true, is_champion: false },
    { name: 'Не определён', total_calls: 6, script_calls: 0, ar_pct: 0, win_pct: 0, is_saboteur: false, is_champion: false },
  ],
  golden_quotes: [
    { call_id: 'call-1', manager_name: 'Мария', quote: 'Добрый день! Меня зовут Мария, компания Ромашка.', timestamp_sec: 3, matched_anchors: [], call_date: '2026-10-28T10:00:00', has_audio: false },
  ],
  ...over,
});

const modules = (locked = false) => ({
  version_id: 'ver-1',
  locked,
  applied_calls: locked ? 5 : 0,
  modules: [
    { id: 'm1', target_criterion: 'cr1', title: 'Твёрдый Next Step', stage_name: 'Фиксация следующего шага', recommended_speech: 'Давайте зафиксируем', semantic_anchors: ['давайте зафиксируем | договоримся', 'завтра | понедельник'], banned_triggers: ['как надумаете'], min_anchors_required: 2 },
    { id: 'm9', target_criterion: 'cr9', title: 'Приветствие и регламент', stage_name: 'Вход в контакт', recommended_speech: 'Добрый день', semantic_anchors: ['меня зовут'], banned_triggers: [], min_anchors_required: 1 },
  ],
});

const comparison = (status: string, verdictText: string) => ({
  tenant_id: 'TNT-A',
  v1: { id: 'ver-0', version_tag: 'v1.0', title: 'Базовая' },
  v2: { id: 'ver-1', version_tag: 'v2.0', title: 'Новая' },
  comparison: [
    {
      criterion: 'cr9', title: 'Приветствие и регламент', stage: 'Вход в контакт',
      v1_metrics: { total_calls: 12, script_calls: 6, ar_pct: 50, swr_pct: 50, fwr_pct: 50, lift_pct: 0, defect_rate_pct: 50 },
      v2_metrics: { total_calls: 12, script_calls: 10, ar_pct: 83.3, swr_pct: 90, fwr_pct: 50, lift_pct: 40, defect_rate_pct: 16.7 },
      delta_lift_pct: 40, delta_defect_rate_pct: -33.3, intervention_verdict: 'IMPROVEMENT_CONFIRMED', verdict_label: '',
    },
  ],
  summary: {
    overall_status: status, summary_verdict: verdictText, improved_criteria_count: 1, degraded_criteria_count: 0,
    neutral_criteria_count: 0, compared_criteria_count: 1, avg_lift_delta_pct: 40, avg_defect_reduction_pct: 33.3,
    note: 'Версии оцениваются на разных звонках.',
  },
});

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <MethodologyPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  act(() => useRevOpsStore.getState().setActiveTenantId('TNT-A'));
  m.getVersions.mockResolvedValue({ tenant_id: 'TNT-A', active_version_id: 'ver-1', versions: [version('ver-1', 'v2.0', true), version('ver-0', 'v1.0', false)] });
  m.getHeatmap.mockResolvedValue(heatmap([FEW, WORKING, CODE]));
  m.getXRay.mockResolvedValue(xray());
  m.getModules.mockResolvedValue(modules());
  m.compareVersions.mockResolvedValue(comparison('NET_POSITIVE', 'Обновление помогло'));
});

describe('MethodologyPage', () => {
  it('shows the version, the numbers of a criterion as they come and no secretary lab', async () => {
    renderPage();
    const cell = await screen.findByTestId('heatmap-cell-cr9');
    expect(screen.getByTestId('version-selector-btn')).toHaveTextContent('v2.0');
    expect(cell.textContent).toContain('Стандарт работает');
    expect(cell.textContent).toContain('Говорят по скрипту: 75%');
    expect(cell.textContent).toContain('по скрипту 90%, своими словами 30%');
    expect(cell.textContent).toContain('+60 п.п.');
    expect(screen.getByText(/Гипотеза версии v2.0/)).toBeInTheDocument();
    expect(screen.queryByTestId('tab-gatekeeper')).not.toBeInTheDocument();
    expect(screen.getByTestId('methodology-coverage')).toHaveTextContent('Оценено звонков: 40 из 40');
  });

  it('counts how many calls are still needed instead of a verdict', async () => {
    renderPage();
    const progress = await screen.findByTestId('progress-cr1');
    expect(progress).toHaveTextContent('Набрано 12 из 30 звонков для вердикта');
    expect(screen.getByTestId('heatmap-cell-cr1').textContent).toContain('Сбор данных');
    expect(screen.queryByTestId('progress-cr9')).not.toBeInTheDocument();
  });

  it('a criterion measured by the code has no speech standard', async () => {
    renderPage();
    const cell = await screen.findByTestId('heatmap-cell-cr11');
    expect(cell.textContent).toContain('Считает код');
    expect(cell.textContent).toContain('речевого стандарта у него нет');
  });

  it('an empty company sees an honest empty state, not zeros as results', async () => {
    m.getHeatmap.mockResolvedValue(heatmap([row('cr1'), row('cr9')], { calls_with_transcript: 0, calls_evaluated: 0 }));
    renderPage();
    expect(await screen.findByTestId('methodology-empty-state')).toBeInTheDocument();
    const cell = screen.getByTestId('heatmap-cell-cr9');
    expect(cell.textContent).toContain('Нет данных');
    expect(cell.textContent).toContain('Звонков по этому критерию ещё не было');
    expect(cell.textContent).not.toContain('0%');
    expect(screen.getByTestId('methodology-coverage')).toHaveTextContent('Звонков с расшифровкой пока нет');
    expect(screen.queryByTestId('backfill-btn')).not.toBeInTheDocument();
  });

  it('judges the history on request and says which calls cannot be judged and why', async () => {
    m.getHeatmap.mockResolvedValue(heatmap([WORKING], { calls_with_transcript: 3, calls_evaluated: 1 }));
    m.backfill.mockResolvedValue({ tenant_id: 'TNT-A', evaluated: 1, skipped: { no_labels: 1, not_assessed: 1 }, coverage: { calls_with_transcript: 3, calls_evaluated: 1 } });
    renderPage();
    fireEvent.click(await screen.findByTestId('backfill-btn'));
    const note = await screen.findByTestId('backfill-note');
    expect(note).toHaveTextContent('Оценено звонков: 1.');
    expect(note).toHaveTextContent('нет разметки реплик');
    expect(note).toHaveTextContent('недозвон или сбой анализа');
    expect(m.backfill).toHaveBeenCalledWith('TNT-A');
    await waitFor(() => expect(m.getHeatmap.mock.calls.length).toBeGreaterThan(1));
  });

  it('shows a load error instead of silent zeros', async () => {
    m.getVersions.mockRejectedValue({ detail: 'Нет доступа к методологии', status_code: 403 });
    renderPage();
    expect(await screen.findByTestId('methodology-error')).toHaveTextContent('Нет доступа к методологии');
  });

  it('shows why a new version was not created', async () => {
    m.createVersion.mockRejectedValue({ detail: 'Версия v3.0 уже существует', status_code: 409 });
    renderPage();
    await screen.findByTestId('heatmap-cell-cr9');
    fireEvent.click(screen.getByTestId('new-version-modal-trigger'));
    fireEvent.change(await screen.findByTestId('input-new-version-tag'), { target: { value: 'v3.0' } });
    fireEvent.change(screen.getByTestId('input-new-version-title'), { target: { value: 'Ещё одна' } });
    fireEvent.click(screen.getByTestId('submit-new-version-btn'));
    expect(await screen.findByTestId('create-version-error')).toHaveTextContent('Версия v3.0 уже существует');
    expect(m.createVersion).toHaveBeenCalledWith(expect.objectContaining({ base_version_id: 'ver-1' }), 'TNT-A');
  });

  it('another company never sees the version of the previous one', async () => {
    m.getVersions.mockImplementation(async (tenant?: string) =>
      tenant === 'TNT-B'
        ? { tenant_id: 'TNT-B', active_version_id: 'verB-1', versions: [version('verB-1', 'v1.0', true)] }
        : { tenant_id: 'TNT-A', active_version_id: 'ver-1', versions: [version('ver-1', 'v2.0', true)] }
    );
    renderPage();
    await screen.findByTestId('heatmap-cell-cr9');
    act(() => useRevOpsStore.getState().setActiveTenantId('TNT-B'));
    await waitFor(() => expect(m.getHeatmap).toHaveBeenCalledWith('verB-1', 'TNT-B'));
    expect(m.getHeatmap).not.toHaveBeenCalledWith('ver-1', 'TNT-B');
  });
});

describe('X-Ray', () => {
  it('shows managers without labels for the unknown one, a real quote and the recording', async () => {
    renderPage();
    fireEvent.click(await screen.findByTestId('heatmap-cell-cr9'));
    const drawer = await screen.findByTestId('methodology-xray-drawer');
    await within(drawer).findByText('Саша');
    expect(drawer.textContent).toContain('говорит по скрипту редко');
    const unknown = within(drawer).getByText('Не определён').closest('div');
    expect(unknown?.parentElement?.textContent).not.toContain('говорит по скрипту редко');
    expect(drawer.textContent).toContain('«Добрый день! Меня зовут Мария, компания Ромашка.»');
    expect(drawer.textContent).toContain('на 00:03');
    expect(within(drawer).queryByTestId('xray-audio-call-1')).not.toBeInTheDocument();  // no recording: no player at all
    expect(within(drawer).queryByText(/Играет/)).not.toBeInTheDocument();
  });

  it('plays the real recording of the quoted call when there is one', async () => {
    const base = xray();
    m.getXRay.mockResolvedValue({ ...base, golden_quotes: [{ ...base.golden_quotes[0], has_audio: true }] });
    renderPage();
    fireEvent.click(await screen.findByTestId('heatmap-cell-cr9'));
    const player = await screen.findByTestId('xray-audio-call-1');
    expect(player).toHaveTextContent('Прослушать запись');
  });

  it('tells how many calls are missing and shows no invented examples', async () => {
    m.getXRay.mockResolvedValue(
      xray({
        verdict: 'COLLECTING_DATA',
        stats: { total_calls: 12, script_calls: 6, freestyle_calls: 6, script_wins: 3, freestyle_wins: 3, ar_pct: 50, swr_pct: 50, fwr_pct: 50, script_lift_pct: 0, enough_data: false, calls_needed: 18 },
        managers: [],
        golden_quotes: [],
      })
    );
    renderPage();
    fireEvent.click(await screen.findByTestId('heatmap-cell-cr1'));
    expect(await screen.findByTestId('xray-needs-data')).toHaveTextContent('Звонков по критерию: 12. Для вывода нужно 30');
    expect(screen.getByTestId('xray-no-quotes')).toBeInTheDocument();
  });

  it('copies a report with a negative difference as a minus, not as "+-"', async () => {
    const writeText = vi.fn();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    m.getXRay.mockResolvedValue(xray({ verdict: 'FREESTYLE_STRONGER', stats: { ...xray().stats, swr_pct: 30, fwr_pct: 50, script_lift_pct: -20 } }));
    renderPage();
    fireEvent.click(await screen.findByTestId('heatmap-cell-cr9'));
    fireEvent.click(await screen.findByText('Скопировать отчёт для планерки'));
    const report = String(writeText.mock.calls[0][0]);
    expect(report).toContain('разница -20 п.п.');
    expect(report).not.toContain('+-');
    expect(report).toContain('Саша');
    expect(report).not.toContain('Не определён');
  });
});

describe('Script editor', () => {
  it('opens on the first criterion of the audit and allows saving only after an edit', async () => {
    renderPage();
    fireEvent.click(await screen.findByTestId('tab-editor'));
    expect(await screen.findByTestId('script-modules-editor')).toBeInTheDocument();
    expect(await screen.findByText(/Фиксация следующего шага/)).toBeInTheDocument();
    expect(screen.getByTestId('save-module-btn')).toBeDisabled();
    expect(screen.queryByTestId('editor-locked')).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Введите образцовую реплику...'), { target: { value: 'Новый текст' } });
    expect(screen.getByTestId('save-module-btn')).toBeEnabled();
  });

  it('a version that was applied to calls is shown but cannot be changed', async () => {
    m.getModules.mockResolvedValue(modules(true));
    renderPage();
    fireEvent.click(await screen.findByTestId('tab-editor'));
    const banner = await screen.findByTestId('editor-locked');
    expect(banner).toHaveTextContent('применялась к 5 звонкам');
    expect(banner).toHaveTextContent('Новая гипотеза');
    expect(screen.getByTestId('save-module-btn')).toBeDisabled();
    expect(screen.getByPlaceholderText('Введите образцовую реплику...')).toBeDisabled();
  });

  it('shows the reason when the server refuses to save', async () => {
    m.updateModule.mockRejectedValue({ detail: 'Порог (3) больше числа формулировок (2)', status_code: 422 });
    renderPage();
    fireEvent.click(await screen.findByTestId('tab-editor'));
    fireEvent.change(await screen.findByPlaceholderText('Введите образцовую реплику...'), { target: { value: 'x' } });
    fireEvent.click(screen.getByTestId('save-module-btn'));
    expect(await screen.findByTestId('save-module-error')).toHaveTextContent('Порог (3) больше числа формулировок (2)');
  });

  it('saves with the threshold never above the number of formulations', async () => {
    m.updateModule.mockResolvedValue({ status: 'updated' });
    renderPage();
    fireEvent.click(await screen.findByTestId('tab-editor'));
    fireEvent.click((await screen.findAllByLabelText('Удалить формулировку'))[0]);
    fireEvent.click(screen.getByTestId('save-module-btn'));
    await waitFor(() => expect(m.updateModule).toHaveBeenCalled());
    const payload = m.updateModule.mock.calls[0][1];
    expect(payload.semantic_anchors).toHaveLength(1);
    expect(payload.min_anchors_required).toBe(1);
  });
});

describe('Comparison of versions', () => {
  it('names the outcome with the words of the server, not "no changes"', async () => {
    renderPage();
    fireEvent.click(await screen.findByTestId('view-compare-btn'));
    const box = await screen.findByTestId('version-comparison-container');
    await waitFor(() => expect(box.textContent).toContain('Обновление помогло'));
    expect(box.textContent).toContain('Улучшение');
    expect(box.textContent).not.toContain('Без существенных изменений');
    expect(box.textContent).toContain('Версии оцениваются на разных звонках.');
  });

  it('says "collecting data" and shows dashes where there are too few calls', async () => {
    m.compareVersions.mockResolvedValue({
      ...comparison('COLLECTING_DATA', 'Пока мало данных: нужно от 10 звонков по критерию в обеих версиях'),
      comparison: [{ ...comparison('x', 'y').comparison[0], intervention_verdict: 'COLLECTING_DATA' }],
    });
    renderPage();
    fireEvent.click(await screen.findByTestId('view-compare-btn'));
    const box = await screen.findByTestId('version-comparison-container');
    await waitFor(() => expect(box.textContent).toContain('Сбор данных'));
    expect(box.textContent).toContain('Пока мало данных');
    expect(box.textContent).toContain('Мало данных');
  });
});

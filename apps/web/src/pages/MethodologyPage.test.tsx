/**
 * apps/web/src/pages/MethodologyPage.test.tsx
 *
 * Unit tests for Methodology & Script Engineering Page:
 * - Version switcher & hypothesis banner
 * - Heatmap tab with 13 criteria and sabotage warning badges
 * - X-Ray Drawer interaction
 * - Gatekeeper Lab tab with winning hooks and killer phrases
 * - Script Modules Editor tab
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MethodologyPage } from './MethodologyPage';
import { apiClient } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  apiClient: {
    methodology: {
      getVersions: vi.fn().mockResolvedValue({
        tenant_id: 'TNT-001',
        active_version_id: 'ver-1',
        versions: [
          {
            id: 'ver-1',
            version_tag: 'v1.0',
            title: 'Базовый речевой стандарт',
            hypothesis: 'Базовая калибровка 13 критериев и смысловых якорей',
            is_active: true,
            activated_at: '2026-10-25T10:00:00Z',
            created_at: '2026-10-25T10:00:00Z',
          },
        ],
      }),
      getHeatmap: vi.fn().mockResolvedValue({
        tenant_id: 'TNT-001',
        version_id: 'ver-1',
        matrix: [
          {
            criterion: 'cr6',
            title: 'Схема принятия решений (ЛПР)',
            stage: 'Обход секретаря / Выход на ЛПР',
            total_relevant_calls: 120,
            script_calls: 34,
            freestyle_calls: 86,
            ar_pct: 28.3,
            swr_pct: 68.0,
            fwr_pct: 19.0,
            total_win_pct: 32.5,
            script_lift_pct: 49.0,
            verdict_status: 'SABOTAGE_HIDDEN_GEM',
            is_sabotage: true,
            delta_pct: 49.0,
          },
          {
            criterion: 'cr1',
            title: 'Приветствие и регламент',
            stage: 'Вход в контакт',
            total_relevant_calls: 120,
            script_calls: 102,
            freestyle_calls: 18,
            ar_pct: 85.0,
            swr_pct: 91.0,
            fwr_pct: 65.0,
            total_win_pct: 87.0,
            script_lift_pct: 26.0,
            verdict_status: 'WORKING_STANDARD',
            is_sabotage: false,
            delta_pct: 26.0,
          },
        ],
      }),
      getXRay: vi.fn().mockResolvedValue({
        criterion: 'cr6',
        title: 'Схема принятия решений (ЛПР)',
        stage: 'Обход секретаря / Выход на ЛПР',
        verdict: 'SABOTAGE_HIDDEN_GEM',
        verdict_label: 'Саботаж: Скрытый алмаз',
        module: {
          recommended_speech: 'По вопросу сокращения кассовых разрывов...',
          semantic_anchors: ['Определение ЛПР', 'Экспертный заход'],
          banned_triggers: ['Вы сами всё решаете?'],
        },
        stats: {
          total_calls: 120,
          script_calls: 34,
          freestyle_calls: 86,
          script_wins: 23,
          freestyle_wins: 16,
          ar_pct: 28.3,
          swr_pct: 68.0,
          fwr_pct: 19.0,
          script_lift_pct: 49.0,
        },
        managers: [
          {
            name: 'Александр Иванов',
            total_calls: 24,
            script_calls: 0,
            ar_pct: 0.0,
            win_pct: 12.5,
            is_saboteur: true,
            is_champion: false,
          },
          {
            name: 'Мария Петрова',
            total_calls: 24,
            script_calls: 22,
            ar_pct: 91.7,
            win_pct: 75.0,
            is_saboteur: false,
            is_champion: true,
          },
        ],
        golden_quotes: [
          {
            call_id: 'call-101',
            manager_name: 'Мария Петрова',
            quote: 'По вопросу сокращения кассовых разрывов, соедините с финансовым директором',
            timestamp_sec: 18,
            matched_anchors: ['Экспертный заход'],
          },
        ],
      }),
      getGatekeeperLab: vi.fn().mockResolvedValue({
        tenant_id: 'TNT-001',
        version_id: 'ver-1',
        total_attempts: 120,
        bypassed_count: 52,
        pass_rate_pct: 43.3,
        winning_hooks: [
          {
            hook_category: 'Экспертный запрос по проблеме',
            phrase: 'По вопросу сокращения кассовых разрывов в филиалах...',
            success_rate_pct: 74.2,
            uses_count: 38,
            timestamp_sec: 18,
            pattern_type: 'EXPERT_VALUE',
          },
        ],
        banned_killer_phrases: [
          {
            phrase: 'Удобно сейчас говорить?',
            drop_rate_pct: 91.0,
            reason: 'Идентифицирует спам',
          },
        ],
      }),
      getModules: vi.fn().mockResolvedValue({
        version_id: 'ver-1',
        modules: [
          {
            id: 'mod-6',
            target_criterion: 'cr6',
            title: 'Схема принятия решений (ЛПР)',
            stage_name: 'Обход секретаря',
            recommended_speech: 'По вопросу сокращения кассовых разрывов...',
            semantic_anchors: ['Определение ЛПР', 'Экспертный заход'],
            banned_triggers: ['Вы сами всё решаете?'],
            min_anchors_required: 2,
          },
        ],
      }),
    },
  },
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <MethodologyPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('MethodologyPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders header, version badge, and default heatmap tab', async () => {
    renderPage();

    expect(screen.getByText('ИИ-Методология и Речевой Инжиниринг')).toBeInTheDocument();
    expect(screen.getByTestId('tab-heatmap')).toBeInTheDocument();
    expect(screen.getByTestId('tab-gatekeeper')).toBeInTheDocument();
    expect(screen.getByTestId('tab-editor')).toBeInTheDocument();

    // Verify heatmap rows loaded
    await waitFor(() => {
      expect(screen.getByTestId('heatmap-cell-cr6')).toBeInTheDocument();
    });

    // Check that cr6 shows Sabotage badge
    expect(screen.getByText('Саботаж')).toBeInTheDocument();
    expect(screen.getByText('+49%')).toBeInTheDocument();
  });

  it('opens X-Ray Drawer when clicking a criterion cell in heatmap', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('heatmap-cell-cr6')).toBeInTheDocument();
    });

    // Click cr6 cell
    fireEvent.click(screen.getByTestId('heatmap-cell-cr6'));

    // Drawer should open and display X-Ray metrics
    await waitFor(() => {
      expect(screen.getByTestId('methodology-xray-drawer')).toBeInTheDocument();
      expect(screen.getByText('Александр Иванов')).toBeInTheDocument();
    });

    expect(screen.getAllByText('Мария Петрова').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Эталонные примеры/i)).toBeInTheDocument();

    // Close drawer
    fireEvent.click(screen.getByTestId('close-xray-drawer'));
    await waitFor(() => {
      expect(screen.queryByTestId('methodology-xray-drawer')).not.toBeInTheDocument();
    });
  });

  it('switches to Gatekeeper Lab tab and displays winning hooks and killer phrases', async () => {
    renderPage();

    // Switch tab
    fireEvent.click(screen.getByTestId('tab-gatekeeper'));

    await waitFor(() => {
      expect(screen.getByTestId('gatekeeper-lab')).toBeInTheDocument();
    });

    expect(screen.getByText('Фразы-Чемпионы (Паттерны обхода)')).toBeInTheDocument();
    expect(screen.getByText('Фразы-Убийцы (Анти-паттерны)')).toBeInTheDocument();
    expect(screen.getByText('74.2% успеха')).toBeInTheDocument();
  });

  it('switches to Script Modules Editor tab and displays module editor', async () => {
    renderPage();

    // Switch tab
    fireEvent.click(screen.getByTestId('tab-editor'));

    await waitFor(() => {
      expect(screen.getByTestId('script-modules-editor')).toBeInTheDocument();
    });

    expect(screen.getByText('Эталонный речевой модуль (Скрипт для менеджера)')).toBeInTheDocument();
    expect(screen.getByText('Смысловые якоря (Semantic Anchors)')).toBeInTheDocument();
    expect(screen.getByText('Табу-фразы (Banned Triggers)')).toBeInTheDocument();
  });
});

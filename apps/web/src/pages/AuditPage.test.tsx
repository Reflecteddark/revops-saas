/**
 * apps/web/src/pages/AuditPage.test.tsx
 *
 * Unit tests for AuditPage component.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuditPage } from './AuditPage';
import { useRevOpsStore } from '@/store/useRevOpsStore';
import { callsApi } from '@/lib/api';
import { addDaysToKey, businessDayKey } from '@/lib/dates';
import { failedCall, makeCall, missedCall, ratedCalls } from '@/test/callFactory';
import type { Call } from '@/types/api';

vi.mock('@/lib/api', () => ({
  callsApi: {
    list: vi.fn(),
  },
}));

beforeEach(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  window.HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
  window.HTMLElement.prototype.setPointerCapture = vi.fn();
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
});

const mockCalls: Call[] = [
  {
    id: 'call-1',
    deal_id: 'deal-1',
    deal_title: 'Сделка АгроХим',
    client: 'ООО АгроХим',
    manager: 'Иван Петров',
    stage: 'Квалификация',
    duration: '04:12',
    amount: '500 000 ₽',
    amount_num: 500000,
    score: 11,
    status: 'won',
    status_label: 'ЭТАЛОН',
    risk_amount: '0 ₽',
    next_step: 1,
    date: '2026-10-24 14:30',
    // CR1=1 (green), CR2=0 (red), CR3=null (gray)
    cr: [1, 0, null, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    error_summary: 'Не уточнил дедлайн',
    recommendation: 'Зафиксировать сроки',
    transcript: 'Транскрипт тестового звонка ООО АгроХим',
    audio_url: 'https://storage.example.com/audio1.mp3',
  },
  {
    id: 'call-2',
    deal_id: 'deal-2',
    deal_title: 'Сделка СтройМаш',
    client: 'АО СтройМаш',
    manager: 'Ольга Смирнова',
    stage: 'Встреча',
    duration: '02:45',
    amount: '200 000 ₽',
    amount_num: 200000,
    score: 4,
    status: 'risk',
    status_label: 'СРЫВ',
    risk_amount: '200 000 ₽',
    next_step: 0,
    date: '2026-10-23 10:15',
    cr: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    error_summary: 'Грубый тон',
    recommendation: 'Обучить скрипту',
    transcript: 'Транскрипт тестового звонка АО СтройМаш',
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

async function pick(testId: string, optionName: string) {
  fireEvent.keyDown(screen.getByTestId(testId), { key: 'ArrowDown' });
  fireEvent.click(await screen.findByRole('option', { name: optionName }));
}

const daysAgo = (n: number) => `${addDaysToKey(businessDayKey(), -n)} 12:00:00`;

describe('AuditPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useRevOpsStore.setState({ activeTenantId: 'TNT-001' });
  });

  it('renders calls table with all loaded calls and counters', async () => {
    vi.mocked(callsApi.list).mockResolvedValue(mockCalls);

    renderWithClient(<AuditPage />);

    expect(await screen.findByText('ООО АгроХим')).toBeInTheDocument();
    expect(screen.getByText('АО СтройМаш')).toBeInTheDocument();
    expect(screen.getByTestId('calls-count')).toHaveTextContent('2');
  });

  it('filters calls when a status filter is selected', async () => {
    vi.mocked(callsApi.list).mockResolvedValue(mockCalls);

    renderWithClient(<AuditPage />);

    expect(await screen.findByText('ООО АгроХим')).toBeInTheDocument();
    expect(screen.getByText('АО СтройМаш')).toBeInTheDocument();

    await pick('filter-status', 'Эталон (9–13)');

    expect(screen.getByText('ООО АгроХим')).toBeInTheDocument();
    expect(screen.queryByText('АО СтройМаш')).not.toBeInTheDocument();
    expect(screen.getByTestId('calls-count')).toHaveTextContent('1');
  });

  it('opens detailed dialog with transcript when call row is clicked', async () => {
    vi.mocked(callsApi.list).mockResolvedValue(mockCalls);

    renderWithClient(<AuditPage />);

    fireEvent.click(await screen.findByText('ООО АгроХим'));

    await waitFor(() => {
      expect(screen.getByTestId('audit-dialog')).toBeInTheDocument();
    });

    expect(screen.getByTestId('audit-call-transcript')).toHaveTextContent('Транскрипт тестового звонка ООО АгроХим');
    expect(screen.getByTestId('audit-call-audio-player')).toBeInTheDocument();
  });

  it('visualizes 13 CR criteria correctly: 1 as green, 0 as red, null as gray', async () => {
    vi.mocked(callsApi.list).mockResolvedValue(mockCalls);

    renderWithClient(<AuditPage />);

    fireEvent.click(await screen.findByText('ООО АгроХим'));

    await waitFor(() => {
      expect(screen.getByTestId('cr-criteria-grid')).toBeInTheDocument();
    });

    expect(screen.getByTestId('cr-item-1')).toHaveClass('text-emerald-500');
    expect(screen.getByTestId('cr-item-1')).toHaveTextContent('1');
    expect(screen.getByTestId('cr-item-2')).toHaveClass('text-red-500');
    expect(screen.getByTestId('cr-item-2')).toHaveTextContent('0');
    expect(screen.getByTestId('cr-item-3')).toHaveClass('text-muted-foreground');
    expect(screen.getByTestId('cr-item-3')).toHaveTextContent('—');
  });

  describe('honest numbers', () => {
    const mixed = [
      ...ratedCalls('Иван Петров', 12, 3, { date: daysAgo(1), next_step: 1 }),
      ...ratedCalls('Ольга Смирнова', 4, 1, { date: daysAgo(2), next_step: 0 }),
      missedCall({ manager: 'Иван Петров', date: daysAgo(1) }),
      failedCall({ manager: 'Не определён', date: daysAgo(3) }),
      ...ratedCalls('Иван Петров', 12, 2, { date: daysAgo(20) }),
    ];

    it('the KPI row counts only rated calls and says what is not rated', async () => {
      vi.mocked(callsApi.list).mockResolvedValue(mixed);
      renderWithClient(<AuditPage />);

      await screen.findByTestId('kpi-total');
      await waitFor(() => expect(screen.getByTestId('kpi-total')).toHaveTextContent('8'));
      expect(screen.getByTestId('kpi-assessed')).toHaveTextContent('6');
      // (12*5 + 4) / 6 = 10.7: the missed call and the failed audit are not zeros
      expect(screen.getByTestId('kpi-avg')).toHaveTextContent('10.7 / 13');
      expect(screen.getByTestId('kpi-not-rated')).toHaveTextContent('2');
      expect(screen.getByTestId('kpi-not-rated')).toHaveTextContent('1 недозвон');
      expect(screen.getByTestId('kpi-not-rated')).toHaveTextContent('1 сбой анализа');
    });

    it('the period filter changes the KPI row and the widgets, not only the table', async () => {
      vi.mocked(callsApi.list).mockResolvedValue(mixed);
      renderWithClient(<AuditPage />);

      await waitFor(() => expect(screen.getByTestId('kpi-total')).toHaveTextContent('8'));
      await pick('filter-period', 'Последние 7 дней');

      await waitFor(() => expect(screen.getByTestId('kpi-total')).toHaveTextContent('6'));
      expect(screen.getByTestId('kpi-assessed')).toHaveTextContent('4');
      expect(screen.getByTestId('calls-count')).toHaveTextContent('6');
      // the heatmap row of Иван Петров now says 4 calls (3 rated + 1 missed), not 7
      expect(within(screen.getByTestId('skill-row-Иван Петров')).getByText(/4 звонка/)).toBeInTheDocument();
    });

    it('the manager filter narrows the table but leaves the KPI row and the widgets alone', async () => {
      vi.mocked(callsApi.list).mockResolvedValue(mixed);
      renderWithClient(<AuditPage />);

      await waitFor(() => expect(screen.getByTestId('kpi-total')).toHaveTextContent('8'));
      await pick('filter-manager', 'Ольга Смирнова');

      await waitFor(() => expect(screen.getByTestId('calls-count')).toHaveTextContent('1'));
      expect(screen.getByTestId('kpi-total')).toHaveTextContent('8');
      expect(screen.getByTestId('skill-row-Иван Петров')).toBeInTheDocument();
    });

    it('shows a status and a Next Step for every call, and a dash for what is unknown', async () => {
      vi.mocked(callsApi.list).mockResolvedValue([
        makeCall({ manager: 'Иван Петров', score: 4, status: 'risk', next_step: 0, client: '' }),
        missedCall({ manager: 'Иван Петров' }),
        failedCall({ manager: 'Иван Петров' }),
      ]);
      renderWithClient(<AuditPage />);

      expect(await screen.findByText('СРЫВ')).toBeInTheDocument();
      expect(screen.getByText('НЕДОЗВОН')).toBeInTheDocument();
      expect(screen.getByText('СБОЙ АНАЛИЗА')).toBeInTheDocument();
      expect(screen.getByText('Нет')).toBeInTheDocument(); // Next Step of the first call
      expect(screen.getByText('4/13')).toBeInTheDocument();
      expect(screen.queryByText('0/13')).not.toBeInTheDocument();
      // no call has a client or a stage: those columns are not shown, and no stub fills the row
      expect(screen.queryByRole('columnheader', { name: 'Клиент' })).not.toBeInTheDocument();
      expect(screen.queryByRole('columnheader', { name: 'Этап' })).not.toBeInTheDocument();
      expect(screen.getAllByRole('row')[1]).not.toHaveTextContent('Клиент');
    });

    it('shows the client and stage columns as soon as one call has them', async () => {
      vi.mocked(callsApi.list).mockResolvedValue([makeCall({ client: 'ООО Тест', stage: 'КП', manager: 'Иван Петров' }), makeCall({ manager: 'Иван Петров' })]);
      renderWithClient(<AuditPage />);

      expect(await screen.findByRole('columnheader', { name: 'Клиент' })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'Этап' })).toBeInTheDocument();
      expect(screen.getByText('ООО Тест')).toBeInTheDocument();
    });

    it('a missed call opens with an explanation and no score', async () => {
      vi.mocked(callsApi.list).mockResolvedValue([missedCall({ manager: 'Иван Петров', client: 'ООО Тест' })]);
      renderWithClient(<AuditPage />);

      fireEvent.click(await screen.findByText('ООО Тест'));

      expect(await screen.findByTestId('audit-notice-unanswered')).toHaveTextContent('не оценивается');
      expect(screen.queryByText(/Итоговый балл/)).not.toBeInTheDocument();
    });

    it('a failed audit says the manager is not to blame', async () => {
      vi.mocked(callsApi.list).mockResolvedValue([failedCall({ manager: 'Иван Петров', client: 'ООО Тест' })]);
      renderWithClient(<AuditPage />);

      fireEvent.click(await screen.findByText('ООО Тест'));

      expect(await screen.findByTestId('audit-notice-failed')).toHaveTextContent('Баллы менеджера от этого не страдают');
    });

    it('explains an empty client instead of an empty table', async () => {
      vi.mocked(callsApi.list).mockResolvedValue([]);
      renderWithClient(<AuditPage />);

      expect(await screen.findByText(/Аудированных звонков пока нет/)).toBeInTheDocument();
      expect(screen.getByTestId('kpi-avg')).toHaveTextContent('—');
      expect(screen.getByTestId('kpi-next-step')).toHaveTextContent('—');
    });
  });
});

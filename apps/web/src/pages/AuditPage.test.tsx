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
    audio: vi.fn(),
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
    has_audio: true,
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
    window.history.replaceState(null, '', '/'); // the filters live in the address: a test must not see the previous one's
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

  it('plays the recording through the server, and the page never holds the stored link', async () => {
    vi.mocked(callsApi.list).mockResolvedValue(mockCalls);
    vi.mocked(callsApi.audio).mockResolvedValue(new Blob(['mp3'], { type: 'audio/mpeg' }));
    URL.createObjectURL = vi.fn(() => 'blob:fake-audio');
    URL.revokeObjectURL = vi.fn();

    renderWithClient(<AuditPage />);
    fireEvent.click(await screen.findByText('ООО АгроХим'));
    fireEvent.click(await screen.findByTestId('audit-call-audio-player-play'));

    const audio = await screen.findByTestId('audit-call-audio-player-audio');
    expect(callsApi.audio).toHaveBeenCalledWith('call-1');
    expect(audio).toHaveAttribute('src', 'blob:fake-audio');
  });

  it('says so when the recording cannot be played, and offers to try again', async () => {
    vi.mocked(callsApi.list).mockResolvedValue(mockCalls);
    vi.mocked(callsApi.audio).mockRejectedValue(new Error('404'));

    renderWithClient(<AuditPage />);
    fireEvent.click(await screen.findByText('ООО АгроХим'));
    fireEvent.click(await screen.findByTestId('audit-call-audio-player-play'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Запись недоступна');
    expect(screen.getByTestId('audit-call-audio-player-play')).toHaveTextContent('Повторить');
  });

  it('shows no player for a call without a recording', async () => {
    vi.mocked(callsApi.list).mockResolvedValue(mockCalls);

    renderWithClient(<AuditPage />);
    fireEvent.click(await screen.findByText('АО СтройМаш'));

    await screen.findByTestId('audit-dialog');
    expect(screen.queryByTestId('audit-call-audio-player')).not.toBeInTheDocument();
  });

  it('shows what the call was about, the basis of the score, and "н/п" for a criterion that did not apply', async () => {
    const cr = [1, 1, 0, 1, null, 0, 1, 1, 1, 0, 1, 1, null] as Call['cr'];
    vi.mocked(callsApi.list).mockResolvedValue([
      { ...mockCalls[0], cr, score: 9, passed: 8, applicable: 11, summary: 'Клиент просит КП до пятницы' },
    ]);

    renderWithClient(<AuditPage />);
    fireEvent.click(await screen.findByText('ООО АгроХим'));

    expect(await screen.findByTestId('audit-call-summary')).toHaveTextContent('Клиент просит КП до пятницы');
    expect(screen.getByTestId('cr-basis')).toHaveTextContent('Пройдено 8 из 11 применимых');
    expect(screen.getByTestId('cr-item-5')).toHaveTextContent('н/п');
    expect(screen.getByTestId('cr-item-13')).toHaveTextContent('н/п');
    expect(screen.getByTestId('cr-item-5')).toHaveClass('text-muted-foreground');
    // CR3 has no "did not apply": null there is only missing data
    expect(screen.getByTestId('cr-item-3')).toHaveTextContent('0');
  });

  it('opens the reason and the quote of a criterion on click', async () => {
    vi.mocked(callsApi.list).mockResolvedValue([
      {
        ...mockCalls[0],
        evidence: { cr1: { why: 'Назвал день и время', quote: 'созвонимся в четверг в 15:00' } },
      },
    ]);

    renderWithClient(<AuditPage />);
    fireEvent.click(await screen.findByText('ООО АгроХим'));
    await screen.findByTestId('cr-criteria-grid');

    expect(screen.queryByTestId('cr-detail-1')).not.toBeInTheDocument();
    fireEvent.click(within(screen.getByTestId('cr-item-1')).getByRole('button'));
    expect(screen.getByTestId('cr-detail-1')).toHaveTextContent('Назвал день и время');
    expect(screen.getByTestId('cr-detail-1')).toHaveTextContent('«созвонимся в четверг в 15:00»');

    // a criterion without a recorded reason does not pretend to open
    expect(within(screen.getByTestId('cr-item-2')).getByRole('button')).toBeDisabled();
  });

  it('explains "н/п" when the AI gave no reason', async () => {
    vi.mocked(callsApi.list).mockResolvedValue([
      { ...mockCalls[0], cr: [1, 1, 1, 1, null, 1, 1, 1, 1, 1, 1, 1, 1] as Call['cr'], passed: 12, applicable: 12 },
    ]);

    renderWithClient(<AuditPage />);
    fireEvent.click(await screen.findByText('ООО АгроХим'));
    await screen.findByTestId('cr-criteria-grid');

    fireEvent.click(within(screen.getByTestId('cr-item-5')).getByRole('button'));
    expect(screen.getByTestId('cr-detail-5')).toHaveTextContent('клиент не говорил, что дорого');
  });

  it('a call nobody talked on has no list of 13 dashes, no "н/п" and no empty transcript block', async () => {
    vi.mocked(callsApi.list).mockResolvedValue([missedCall({ id: 'm-1', manager: 'Иван Петров', client: 'Автоответчик', cr: Array(13).fill(null) as Call['cr'], transcript: '' })]);

    renderWithClient(<AuditPage />);
    fireEvent.click(await screen.findByText('Автоответчик'));
    await screen.findByTestId('audit-notice-unanswered');

    expect(screen.queryByTestId('cr-criteria-grid')).not.toBeInTheDocument();
    expect(screen.queryByTestId('cr-basis')).not.toBeInTheDocument();
    expect(screen.queryByTestId('audit-call-transcript')).not.toBeInTheDocument();
    expect(screen.getByTestId('audit-card-verdict')).toHaveTextContent('НЕДОЗВОН');
    expect(screen.queryByTestId('audit-card-score')).not.toBeInTheDocument();
  });

  it('the card opens with the verdict and the score, and the gist comes before the 13 criteria', async () => {
    vi.mocked(callsApi.list).mockResolvedValue([{ ...mockCalls[0], summary: 'Клиент просит КП до пятницы' }]);

    renderWithClient(<AuditPage />);
    fireEvent.click(await screen.findByText('ООО АгроХим'));

    expect(await screen.findByTestId('audit-card-verdict')).toHaveTextContent('ЭТАЛОН');
    expect(screen.getByTestId('audit-card-score')).toHaveTextContent('11/13');
    const summary = screen.getByTestId('audit-call-summary');
    const grid = screen.getByTestId('cr-criteria-grid');
    expect(summary.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('a row opens from the keyboard (Enter), not only with the mouse', async () => {
    vi.mocked(callsApi.list).mockResolvedValue(mockCalls);

    renderWithClient(<AuditPage />);
    const row = (await screen.findByText('ООО АгроХим')).closest('tr') as HTMLElement;
    expect(row).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(row, { key: 'Enter' });

    expect(await screen.findByTestId('audit-dialog')).toBeInTheDocument();
  });

  it('a failed load shows the error and its way out, not zeros and "no calls yet"', async () => {
    vi.mocked(callsApi.list).mockRejectedValue(new Error('500'));

    renderWithClient(<AuditPage />);

    const alert = await screen.findByTestId('audit-error');
    expect(alert).toHaveTextContent('не загрузились');
    expect(within(alert).getByRole('button', { name: 'Повторить' })).toBeInTheDocument();
    expect(screen.queryByTestId('audit-kpis')).not.toBeInTheDocument();
    expect(screen.queryByTestId('calls-count')).not.toBeInTheDocument();
    expect(screen.queryByText(/Аудированных звонков пока нет/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Все звонки оценены/)).not.toBeInTheDocument();
  });

  it('the card links to the deal in the CRM, and only when the server knows the address', async () => {
    vi.mocked(callsApi.list).mockResolvedValue([{ ...mockCalls[0], crm_url: 'https://client.amocrm.ru/leads/detail/5272089' }, mockCalls[1]]);
    renderWithClient(<AuditPage />);

    fireEvent.click(await screen.findByText('ООО АгроХим'));
    expect(await screen.findByTestId('crm-deal-link')).toHaveAttribute('href', 'https://client.amocrm.ru/leads/detail/5272089');
    fireEvent.keyDown(screen.getByTestId('audit-dialog'), { key: 'Escape' });

    fireEvent.click(await screen.findByText('АО СтройМаш'));
    await screen.findByTestId('audit-dialog');
    expect(screen.queryByTestId('crm-deal-link')).not.toBeInTheDocument();
  });

  it('a link or a bookmark with filters in the address opens the table already filtered', async () => {
    window.history.replaceState(null, '', '/audit?status=risk');
    vi.mocked(callsApi.list).mockResolvedValue(mockCalls);
    renderWithClient(<AuditPage />);

    expect(await screen.findByText('АО СтройМаш')).toBeInTheDocument();
    expect(screen.queryByText('ООО АгроХим')).not.toBeInTheDocument();
    expect(screen.getByTestId('calls-count')).toHaveTextContent('1');
  });

  it('a nonsense value in the address is ignored, not trusted', async () => {
    window.history.replaceState(null, '', '/audit?status=hacked&cr=99&period=yesterday');
    vi.mocked(callsApi.list).mockResolvedValue(mockCalls);
    renderWithClient(<AuditPage />);

    expect(await screen.findByText('ООО АгроХим')).toBeInTheDocument();
    expect(screen.getByText('АО СтройМаш')).toBeInTheDocument();
    expect(screen.getByTestId('calls-count')).toHaveTextContent('2');
    expect(window.location.search).toBe(''); // and the address is cleaned of it
  });

  it('a very long search text in the address is cut to 80 letters', async () => {
    window.history.replaceState(null, '', '/audit?q=' + 'я'.repeat(200));
    vi.mocked(callsApi.list).mockResolvedValue(mockCalls);
    renderWithClient(<AuditPage />);

    await screen.findByTestId('filter-search');
    expect((screen.getByTestId('filter-search') as HTMLInputElement).value).toHaveLength(80);
  });

  it('the address follows the filters and is clean again after "Сбросить"', async () => {
    vi.mocked(callsApi.list).mockResolvedValue(mockCalls);
    renderWithClient(<AuditPage />);
    await screen.findByText('ООО АгроХим');

    await pick('filter-status', 'Срыв (0–5)');
    expect(window.location.search).toBe('?status=risk');

    fireEvent.change(screen.getByTestId('filter-search'), { target: { value: 'СтройМаш' } });
    expect(new URLSearchParams(window.location.search).get('q')).toBe('СтройМаш');

    fireEvent.click(screen.getByRole('button', { name: 'Сбросить' }));
    expect(window.location.search).toBe('');
    expect(screen.getByTestId('filter-search')).toHaveValue('');
  });

  it('the search finds a call by client, deal or manager, in any case', async () => {
    vi.mocked(callsApi.list).mockResolvedValue(mockCalls);
    renderWithClient(<AuditPage />);
    await screen.findByText('ООО АгроХим');

    fireEvent.change(screen.getByTestId('filter-search'), { target: { value: 'агрохим' } });
    expect(screen.getByTestId('calls-count')).toHaveTextContent('1');
    expect(screen.queryByText('АО СтройМаш')).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId('filter-search'), { target: { value: 'смирнова' } }); // a manager
    expect(screen.getByText('АО СтройМаш')).toBeInTheDocument();
    expect(screen.queryByText('ООО АгроХим')).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId('filter-search'), { target: { value: 'нет такого' } });
    expect(screen.getByText(/не найдено/)).toBeInTheDocument();
  });

  it('the CSV carries the gist, the remarks and the advice, and a text that looks like a formula is made plain', async () => {
    let csv = '';
    URL.createObjectURL = vi.fn((b: Blob) => {
      const reader = new FileReader();
      reader.onload = () => {
        csv = String(reader.result);
      };
      reader.readAsText(b);
      return 'blob:csv';
    });
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.mocked(callsApi.list).mockResolvedValue([
      {
        ...mockCalls[0],
        summary: 'Клиент просит КП',
        error_summary: '=HYPERLINK("http://evil")',
        recommendation: 'Строка 1\nстрока 2',
      },
    ]);
    renderWithClient(<AuditPage />);
    await screen.findByText('ООО АгроХим');

    fireEvent.click(screen.getByTestId('btn-export-csv'));
    await waitFor(() => expect(csv).not.toBe(''));

    const lines = csv.replace('﻿', '').split('\r\n');
    expect(lines[0]).toContain('Следующий шаг');
    expect(lines[0].endsWith('Суть звонка;Замечания ИИ;Рекомендация')).toBe(true);
    expect(lines[1]).toContain('"Клиент просит КП"');
    expect(lines[1]).toContain(`"'=HYPERLINK(`);
    expect(lines[1]).toContain('"Строка 1 строка 2"'); // one line per call
    click.mockRestore();
  });

  it('the CSV button is off when there is nothing to export', async () => {
    vi.mocked(callsApi.list).mockResolvedValue([]);
    renderWithClient(<AuditPage />);

    await screen.findByText(/Аудированных звонков пока нет/);
    expect(screen.getByTestId('btn-export-csv')).toBeDisabled();
  });

  it('a click on a podium card brings the filtered table into view', async () => {
    vi.mocked(callsApi.list).mockResolvedValue([
      ...ratedCalls('Иван Петров', 12, 3, { date: daysAgo(1) }),
      ...ratedCalls('Ольга Смирнова', 8, 3, { date: daysAgo(1) }),
      ...ratedCalls('Пётр Сидоров', 5, 3, { date: daysAgo(1) }),
    ]);
    renderWithClient(<AuditPage />);

    fireEvent.click(await screen.findByTestId('podium-card-1'));

    await waitFor(() => expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalled());
    expect(screen.getByTestId('calls-count')).toHaveTextContent('3');
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

    it('clicking a criterion on the heatmap header filters the table, and clicking it again clears the filter', async () => {
      const failsCr6 = ratedCalls('Иван Петров', 5, 2, { client: 'ООО Провал' });
      const passesAll = ratedCalls('Иван Петров', 13, 1, { client: 'ООО Успех' });
      vi.mocked(callsApi.list).mockResolvedValue([...failsCr6, ...passesAll]);
      renderWithClient(<AuditPage />);

      await waitFor(() => expect(screen.getByTestId('calls-count')).toHaveTextContent('3'));
      const header = within(screen.getByTestId('skills-heatmap')).getByRole('button', { name: 'CR6' });

      fireEvent.click(header);
      await waitFor(() => expect(screen.getByTestId('calls-count')).toHaveTextContent('2'));
      expect(screen.queryByText('ООО Успех')).not.toBeInTheDocument();

      fireEvent.click(header);
      await waitFor(() => expect(screen.getByTestId('calls-count')).toHaveTextContent('3'));
    });

    it('hovering a heatmap column highlights the same criterion on the radar', async () => {
      vi.mocked(callsApi.list).mockResolvedValue(ratedCalls('Иван Петров', 5, 3));
      renderWithClient(<AuditPage />);

      await waitFor(() => expect(screen.getByTestId('kpi-total')).toHaveTextContent('3'));
      fireEvent.mouseEnter(within(screen.getByTestId('skills-heatmap')).getByRole('button', { name: 'CR7' }));

      expect(await screen.findByTestId('radar-hint-value')).toHaveTextContent('0%'); // CR7 fails in a 5/13 call
      expect(within(screen.getByTestId('speech-radar-chart')).getByText('Презентация через кейсы и цифры:')).toBeInTheDocument();
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

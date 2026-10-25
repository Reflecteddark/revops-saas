/**
 * apps/web/src/pages/AuditPage.test.tsx
 *
 * Unit tests for AuditPage component.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuditPage } from './AuditPage';
import { useRevOpsStore } from '@/store/useRevOpsStore';
import { callsApi } from '@/lib/api';
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
    status_label: 'Успешно',
    risk_amount: '0 ₽',
    next_step: 1,
    date: '2026-10-24 14:30',
    // CR1=1 (green), CR2=0 (red), CR3=null (gray)
    cr: [1, 0, null, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    error_summary: 'Не уточнил дедлайн',
    recommendation: 'Зафиксировать сроки',
    transcript: 'Транскрипт тестового звонка ООО АгроХим',
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
    status: 'lost',
    status_label: 'Отказ',
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

    // Open status filter dropdown and select 'won'
    const statusTrigger = screen.getByTestId('filter-status');
    fireEvent.keyDown(statusTrigger, { key: 'ArrowDown' });

    const wonOption = await screen.findByText('Успешно (won)');
    fireEvent.click(wonOption);

    // After filtering, only ООО АгроХим (won) should remain
    expect(screen.getByText('ООО АгроХим')).toBeInTheDocument();
    expect(screen.queryByText('АО СтройМаш')).not.toBeInTheDocument();
    expect(screen.getByTestId('calls-count')).toHaveTextContent('1');
  });

  it('opens detailed dialog with transcript when call row is clicked', async () => {
    vi.mocked(callsApi.list).mockResolvedValue(mockCalls);

    renderWithClient(<AuditPage />);

    const clientCell = await screen.findByText('ООО АгроХим');
    fireEvent.click(clientCell);

    await waitFor(() => {
      expect(screen.getByTestId('audit-dialog')).toBeInTheDocument();
    });

    expect(screen.getByTestId('audit-call-transcript')).toHaveTextContent(
      'Транскрипт тестового звонка ООО АгроХим'
    );
  });

  it('visualizes 13 CR criteria correctly: 1 as green, 0 as red, null as gray', async () => {
    vi.mocked(callsApi.list).mockResolvedValue(mockCalls);

    renderWithClient(<AuditPage />);

    const clientCell = await screen.findByText('ООО АгроХим');
    fireEvent.click(clientCell);

    await waitFor(() => {
      expect(screen.getByTestId('cr-criteria-grid')).toBeInTheDocument();
    });

    // Check CR1 (val: 1 -> green text-emerald-500)
    const cr1 = screen.getByTestId('cr-item-1');
    expect(cr1).toHaveClass('text-emerald-500');
    expect(cr1).toHaveTextContent('1');

    // Check CR2 (val: 0 -> red text-red-500)
    const cr2 = screen.getByTestId('cr-item-2');
    expect(cr2).toHaveClass('text-red-500');
    expect(cr2).toHaveTextContent('0');

    // Check CR3 (val: null -> gray text-muted-foreground)
    const cr3 = screen.getByTestId('cr-item-3');
    expect(cr3).toHaveClass('text-muted-foreground');
    expect(cr3).toHaveTextContent('null');
  });
});

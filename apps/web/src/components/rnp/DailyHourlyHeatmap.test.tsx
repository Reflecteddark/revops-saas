import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect } from 'vitest';
import {
  DailyHourlyHeatmap,
  extractCallHourAndDate,
  isCallOverMinute,
} from './DailyHourlyHeatmap';
import { Call, ManagerConfig } from '@/types/api';

const mockManagers: ManagerConfig[] = [
  {
    id: 'm1',
    name: 'Дмитрий Федотов',
    role: 'РОП',
    capacity: 50,
    daily_calls_target: 20,
    daily_dials_target: 40,
    monthly_meetings_target: 15,
    meetings_enabled: true,
  },
  {
    id: 'm2',
    name: 'Надежда',
    role: 'Менеджер ОП',
    capacity: 40,
    daily_calls_target: 25,
    daily_dials_target: 40,
    monthly_meetings_target: 20,
    meetings_enabled: false,
  },
];

const mockCalls: Call[] = [
  // Dmitry at 10:15 (duration 95s - over 1 min)
  {
    id: 'c1',
    deal_id: 'd1',
    deal_title: 'Сделка 1',
    client: 'ООО Рога',
    manager: 'Дмитрий Федотов',
    stage: 'Переговоры',
    duration: '01:35',
    duration_seconds: 95,
    amount: '100 000 ₽',
    amount_num: 100000,
    score: 8,
    status: 'won',
    status_label: 'ЭТАЛОН',
    risk_amount: '0 ₽',
    next_step: 1,
    date: '2026-10-26 10:15:00',
    cr: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    error_summary: '',
    recommendation: '',
    transcript: 'Тест',
  },
  // Dmitry at 10:45 (duration 30s - dial attempt, under 1 min)
  {
    id: 'c2',
    deal_id: 'd2',
    deal_title: 'Сделка 2',
    client: 'ИП Иванов',
    manager: 'Дмитрий Федотов',
    stage: 'Переговоры',
    duration: '00:30',
    duration_seconds: 30,
    amount: '50 000 ₽',
    amount_num: 50000,
    score: null,
    status: 'risk',
    status_label: 'СЛИВ',
    risk_amount: '50 000 ₽',
    next_step: 0,
    date: '2026-10-26 10:45:00',
    cr: [],
    error_summary: '',
    recommendation: '',
    transcript: 'Недозвон',
  },
  // Nadezhda at 14:10 (duration 120s - over 1 min)
  {
    id: 'c3',
    deal_id: 'd3',
    deal_title: 'Сделка 3',
    client: 'АО Вектор',
    manager: 'Надежда',
    stage: 'КП',
    duration: '02:00',
    duration_seconds: 120,
    amount: '200 000 ₽',
    amount_num: 200000,
    score: 9,
    status: 'won',
    status_label: 'ЭТАЛОН',
    risk_amount: '0 ₽',
    next_step: 1,
    date: '2026-10-26 14:10:00',
    cr: [],
    error_summary: '',
    recommendation: '',
    transcript: 'Успешная встреча',
  },
];

describe('DailyHourlyHeatmap Helpers', () => {
  it('extractCallHourAndDate parses ISO, spaced, and Russian formatted timestamps', () => {
    expect(
      extractCallHourAndDate({ ...mockCalls[0], date: '2026-10-26 10:15:00' })
    ).toEqual({ dateStr: '2026-10-26', hour: 10 });

    expect(
      extractCallHourAndDate({ ...mockCalls[0], date: '2026-10-26T18:45:00Z' })
    ).toEqual({ dateStr: '2026-10-26', hour: 18 });

    expect(
      extractCallHourAndDate({ ...mockCalls[0], date: '26.10.2026 14:20:00' })
    ).toEqual({ dateStr: '2026-10-26', hour: 14 });
  });

  it('isCallOverMinute correctly checks duration_seconds and duration string', () => {
    expect(isCallOverMinute(mockCalls[0])).toBe(true); // 95s
    expect(isCallOverMinute(mockCalls[1])).toBe(false); // 30s
    expect(
      isCallOverMinute({ ...mockCalls[0], duration_seconds: undefined, duration: '01:15' })
    ).toBe(true);
    expect(
      isCallOverMinute({ ...mockCalls[0], duration_seconds: undefined, duration: '00:45' })
    ).toBe(false);
  });
});

describe('DailyHourlyHeatmap Component', () => {
  it('renders heatmap table with hours 08:00 to 20:00 and team summary row', () => {
    render(
      <DailyHourlyHeatmap
        calls={mockCalls}
        managers={mockManagers}
        selectedDate="2026-10-26"
      />
    );

    // Title and badge
    expect(screen.getByText(/Температурная карта звонков отдела/i)).toBeInTheDocument();
    expect(screen.getByText(/наборы \/ от 1 мин/i)).toBeInTheDocument();

    // Hours columns
    expect(screen.getByText('08:00')).toBeInTheDocument();
    expect(screen.getByText('10:00')).toBeInTheDocument();
    expect(screen.getByText('14:00')).toBeInTheDocument();
    expect(screen.getByText('20:00')).toBeInTheDocument();

    // Manager row for Dmitry: in hour 10:00, 2 dials / 1 conversation >=60s
    const dmitryCell = screen.getByTestId('cell-Дмитрий Федотов-10');
    expect(dmitryCell).toHaveTextContent('2 / 1');

    // Nadezhda row: in hour 14:00, 1 dial / 1 conversation >=60s
    const nadezhdaCell = screen.getByTestId('cell-Надежда-14');
    expect(nadezhdaCell).toHaveTextContent('1 / 1');

    // Team totals row
    const totalsRow = screen.getByTestId('heatmap-team-totals-row');
    expect(totalsRow).toBeInTheDocument();
    expect(totalsRow).toHaveTextContent('Всего отдел:');
    // Team total for day: 3 dials / 2 conversations >=60s
    expect(totalsRow).toHaveTextContent('3 / 2');
  });

  it('allows switching selected date via dropdown', () => {
    const multiDateCalls: Call[] = [
      ...mockCalls,
      {
        ...mockCalls[0],
        id: 'c-prev',
        date: '2026-10-25 11:00:00',
        duration_seconds: 100,
      },
    ];

    render(
      <DailyHourlyHeatmap
        calls={multiDateCalls}
        managers={mockManagers}
        selectedDate="2026-10-26"
      />
    );

    const selector = screen.getByTestId('heatmap-date-selector') as HTMLSelectElement;
    expect(selector.value).toBe('2026-10-26');

    // Switch to 2026-10-25
    fireEvent.change(selector, { target: { value: '2026-10-25' } });
    expect(selector.value).toBe('2026-10-25');
  });
});

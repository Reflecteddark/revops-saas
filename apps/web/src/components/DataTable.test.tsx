/**
 * apps/web/src/components/DataTable.test.tsx
 *
 * Unit tests for DataTable component.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from './DataTable';

interface TestItem {
  id: string;
  name: string;
  amount: number;
}

const columns: ColumnDef<TestItem, unknown>[] = [
  {
    accessorKey: 'name',
    header: 'Имя',
  },
  {
    accessorKey: 'amount',
    header: 'Сумма',
  },
];

const mockData: TestItem[] = [
  { id: '1', name: 'Борис', amount: 500 },
  { id: '2', name: 'Анна', amount: 300 },
  { id: '3', name: 'Виктор', amount: 1000 },
];

describe('DataTable', () => {
  it('renders headers from columns correctly', () => {
    render(<DataTable columns={columns} data={mockData} />);

    expect(screen.getByText('Имя')).toBeInTheDocument();
    expect(screen.getByText('Сумма')).toBeInTheDocument();
  });

  it('displays emptyMessage when data is empty and loading is false', () => {
    render(
      <DataTable
        columns={columns}
        data={[]}
        loading={false}
        emptyMessage="Сделок не найдено"
      />
    );

    expect(screen.getByText('Сделок не найдено')).toBeInTheDocument();
  });

  it('a clickable row is reachable with Tab and opens with Enter or Space', () => {
    const onRowClick = vi.fn();
    render(<DataTable columns={columns} data={mockData} onRowClick={onRowClick} />);

    const row = screen.getByText('Борис').closest('tr') as HTMLElement;
    expect(row).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(row, { key: 'Enter' });
    fireEvent.keyDown(row, { key: ' ' });
    fireEvent.keyDown(row, { key: 'a' });

    expect(onRowClick).toHaveBeenCalledTimes(2);
    expect(onRowClick).toHaveBeenCalledWith(mockData[0]);
  });

  it('a row without a click handler is not a tab stop', () => {
    render(<DataTable columns={columns} data={mockData} />);
    expect(screen.getByText('Борис').closest('tr')).not.toHaveAttribute('tabindex');
  });

  it('a key pressed inside a row (a button in a cell) does not open the row', () => {
    const onRowClick = vi.fn();
    const withButton: ColumnDef<TestItem, unknown>[] = [
      { accessorKey: 'name', header: 'Имя', cell: ({ row }) => <button>{row.original.name}</button> },
    ];
    render(<DataTable columns={withButton} data={mockData} onRowClick={onRowClick} />);

    fireEvent.keyDown(screen.getByRole('button', { name: 'Борис' }), { key: 'Enter' });

    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('renders skeleton rows when loading is true and hides empty message', () => {
    render(
      <DataTable
        columns={columns}
        data={[]}
        loading={true}
        emptyMessage="Нет данных"
      />
    );

    expect(screen.queryByText('Нет данных')).not.toBeInTheDocument();
    const skeletonRows = screen.getAllByTestId('skeleton-row');
    expect(skeletonRows).toHaveLength(5);
  });

  it('toggles column sorting and changes row order on header click', () => {
    render(
      <DataTable columns={columns} data={mockData} enableSorting={true} />
    );

    const header = screen.getByText('Имя');

    // First click: asc (Анна, Борис, Виктор)
    fireEvent.click(header);
    let cells = screen.getAllByRole('cell');
    expect(cells[0]).toHaveTextContent('Анна');
    expect(cells[2]).toHaveTextContent('Борис');
    expect(cells[4]).toHaveTextContent('Виктор');

    // Second click: desc (Виктор, Борис, Анна)
    fireEvent.click(header);
    cells = screen.getAllByRole('cell');
    expect(cells[0]).toHaveTextContent('Виктор');
    expect(cells[2]).toHaveTextContent('Борис');
    expect(cells[4]).toHaveTextContent('Анна');
  });

  it('invokes onRowClick with correct row data when row is clicked', () => {
    const handleRowClick = vi.fn();
    render(
      <DataTable
        columns={columns}
        data={mockData}
        onRowClick={handleRowClick}
      />
    );

    const targetRow = screen.getByText('Борис').closest('tr');
    expect(targetRow).toBeInTheDocument();
    if (targetRow) {
      fireEvent.click(targetRow);
    }

    expect(handleRowClick).toHaveBeenCalledTimes(1);
    expect(handleRowClick).toHaveBeenCalledWith(mockData[0]);
  });

  it('handles pagination when data exceeds pageSize', () => {
    const manyItems: TestItem[] = Array.from({ length: 25 }, (_, i) => ({
      id: String(i + 1),
      name: `Клиент ${i + 1}`,
      amount: (i + 1) * 100,
    }));

    render(<DataTable columns={columns} data={manyItems} pageSize={10} />);

    expect(screen.getByText('Страница 1 из 3')).toBeInTheDocument();
    expect(screen.getByText('Клиент 1')).toBeInTheDocument();
    expect(screen.queryByText('Клиент 15')).not.toBeInTheDocument();

    const nextBtn = screen.getByText('Вперёд');
    fireEvent.click(nextBtn);

    expect(screen.getByText('Страница 2 из 3')).toBeInTheDocument();
    expect(screen.getByText('Клиент 11')).toBeInTheDocument();
  });
});

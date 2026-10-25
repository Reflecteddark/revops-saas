/**
 * apps/web/src/pages/AuditPage.tsx
 *
 * Calls audit page featuring comprehensive filtering by status, manager, and date period,
 * tabular inspection, and modal detailed view with 13 CR criteria audit scores and transcript.
 */

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { ClipboardCheck, Filter } from 'lucide-react';
import { DataTable } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useActiveTenantSafe } from '@/hooks/useActiveTenant';
import { callsApi } from '@/lib/api';
import type { Call } from '@/types/api';

export const CR_LABELS: string[] = [
  'Установление контакта',
  'Программирование звонка',
  'Квалификация клиента',
  'Выявление болей / потребности',
  'Презентация под боли',
  'Работа с возражениями',
  'Фиксация Next Step / Zoom',
  'Инициатива в диалоге',
  'Экспертность менеджера',
  'Отсутствие слов-паразитов',
  'Обозначение дедлайна',
  'Понимание бюджета',
  'Завершение звонка',
];

const auditColumns: ColumnDef<Call, unknown>[] = [
  {
    accessorKey: 'date',
    header: 'Дата',
    cell: ({ row }) => (
      <span className="font-mono text-xs text-muted-foreground whitespace-nowrap">
        {row.original.date}
      </span>
    ),
  },
  {
    accessorKey: 'client',
    header: 'Клиент',
    cell: ({ row }) => (
      <div className="font-medium text-foreground">
        <div>{row.original.client}</div>
        <div className="text-[11px] text-muted-foreground font-normal">
          {row.original.deal_title}
        </div>
      </div>
    ),
  },
  {
    accessorKey: 'manager',
    header: 'Менеджер',
    cell: ({ row }) => (
      <span className="text-muted-foreground text-xs">{row.original.manager}</span>
    ),
  },
  {
    accessorKey: 'stage',
    header: 'Этап',
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">{row.original.stage || '—'}</span>
    ),
  },
  {
    accessorKey: 'duration',
    header: 'Длительность',
    cell: ({ row }) => (
      <span className="font-mono text-xs text-muted-foreground">
        {row.original.duration || '—'}
      </span>
    ),
  },
  {
    accessorKey: 'score',
    header: 'Балл',
    cell: ({ row }) => {
      const score = row.original.score;
      if (score === null || score === undefined) {
        return <span className="text-muted-foreground">—</span>;
      }
      return (
        <span
          className={
            score >= 9
              ? 'font-semibold text-emerald-500'
              : score >= 6
              ? 'font-medium text-amber-500'
              : 'font-medium text-red-500'
          }
        >
          {score}/13
        </span>
      );
    },
  },
  {
    accessorKey: 'status',
    header: 'Статус',
    cell: ({ row }) => {
      const status = row.original.status;
      const label = row.original.status_label || status;
      const variant =
        status === 'won'
          ? 'default'
          : status === 'lost' || status === 'fake_yes'
          ? 'destructive'
          : 'secondary';

      return <Badge variant={variant}>{label}</Badge>;
    },
  },
];

export function AuditPage() {
  const tenantId = useActiveTenantSafe();
  const [selectedCall, setSelectedCall] = React.useState<Call | null>(null);

  // Filters state
  const [statusFilter, setStatusFilter] = React.useState<string>('all');
  const [managerFilter, setManagerFilter] = React.useState<string>('all');
  const [periodFilter, setPeriodFilter] = React.useState<string>('all');

  const {
    data: calls = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['calls', tenantId],
    queryFn: () => callsApi.list({ tenant_id: tenantId! }),
    enabled: Boolean(tenantId),
  });

  if (!tenantId) {
    return (
      <div
        className="flex min-h-[400px] flex-col items-center justify-center text-center p-8"
        data-testid="empty-tenant-state"
      >
        <div className="rounded-full bg-muted p-4 mb-4">
          <ClipboardCheck className="h-8 w-8 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold tracking-tight">Тенант не выбран</h2>
        <p className="mt-1 text-sm text-muted-foreground max-w-sm">
          Выберите тенант в шапке приложения для просмотра таблицы аудита звонков.
        </p>
      </div>
    );
  }

  // Unique managers
  const managers = Array.from(new Set(calls.map((c) => c.manager).filter(Boolean)));

  // Filtered dataset
  const filteredCalls = calls.filter((call) => {
    // Status filter
    if (statusFilter !== 'all' && call.status !== statusFilter) {
      return false;
    }
    // Manager filter
    if (managerFilter !== 'all' && call.manager !== managerFilter) {
      return false;
    }
    // Period filter (relative to call.date string)
    if (periodFilter !== 'all') {
      const callDate = new Date(call.date);
      if (!isNaN(callDate.getTime())) {
        const now = new Date();
        const diffDays = (now.getTime() - callDate.getTime()) / (1000 * 3600 * 24);
        if (periodFilter === '7d' && diffDays > 7) return false;
        if (periodFilter === '30d' && diffDays > 30) return false;
      }
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Аудит звонков
            </h1>
            <Badge variant="outline" className="font-mono text-xs" data-testid="calls-count">
              {filteredCalls.length}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Детализированный реестр звонков с проверкой 13 критериев B2B-продаж.
          </p>
        </div>
      </div>

      {/* Error Alert */}
      {isError && (
        <Alert variant="destructive" className="flex items-center justify-between" data-testid="audit-error">
          <div>
            <AlertTitle>Ошибка загрузки</AlertTitle>
            <AlertDescription>
              Не удалось загрузить реестр звонков для тенанта {tenantId}.
            </AlertDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="ml-4 shrink-0">
            Повторить
          </Button>
        </Alert>
      )}

      {/* Filters Bar */}
      <div className="surface flex flex-wrap items-center gap-3 p-3">
        <div className="flex items-center space-x-2 text-xs font-medium text-muted-foreground mr-1">
          <Filter className="h-4 w-4" />
          <span>Фильтры:</span>
        </div>

        {/* Status filter */}
        <div className="w-[160px]">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 text-xs" data-testid="filter-status">
              <SelectValue placeholder="Статус" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">Все статусы</SelectItem>
              <SelectItem value="won" className="text-xs">Успешно (won)</SelectItem>
              <SelectItem value="lost" className="text-xs">Отказ (lost)</SelectItem>
              <SelectItem value="fake_yes" className="text-xs">Fake Yes</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Manager filter */}
        <div className="w-[170px]">
          <Select value={managerFilter} onValueChange={setManagerFilter}>
            <SelectTrigger className="h-8 text-xs" data-testid="filter-manager">
              <SelectValue placeholder="Менеджер" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">Все менеджеры</SelectItem>
              {managers.map((m) => (
                <SelectItem key={m} value={m} className="text-xs">
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Period filter */}
        <div className="w-[150px]">
          <Select value={periodFilter} onValueChange={setPeriodFilter}>
            <SelectTrigger className="h-8 text-xs" data-testid="filter-period">
              <SelectValue placeholder="Период" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">За все время</SelectItem>
              <SelectItem value="7d" className="text-xs">Последние 7 дней</SelectItem>
              <SelectItem value="30d" className="text-xs">Последние 30 дней</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {(statusFilter !== 'all' || managerFilter !== 'all' || periodFilter !== 'all') && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setStatusFilter('all');
              setManagerFilter('all');
              setPeriodFilter('all');
            }}
            className="h-8 text-xs px-2 text-muted-foreground hover:text-foreground"
          >
            Сбросить
          </Button>
        )}
      </div>

      {/* DataTable */}
      <DataTable
        columns={auditColumns}
        data={filteredCalls}
        loading={isLoading}
        emptyMessage="Звонков по выбранным критериям не найдено"
        onRowClick={(call) => setSelectedCall(call)}
        pageSize={20}
      />

      {/* Call Detail Dialog with 13 CR Criteria Audit */}
      <Dialog open={Boolean(selectedCall)} onOpenChange={(open) => !open && setSelectedCall(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col" data-testid="audit-dialog">
          <DialogHeader>
            <DialogTitle>
              {selectedCall?.deal_title || selectedCall?.client || 'Звонок'}
            </DialogTitle>
            <DialogDescription>
              Менеджер: {selectedCall?.manager} | Дата: {selectedCall?.date} | Длительность:{' '}
              {selectedCall?.duration || '—'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-5 pr-1 mt-2">
            {/* 13 CR Criteria visualization */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  13 Критериев аудита (CR1 – CR13)
                </h4>
                {selectedCall?.score !== null && selectedCall?.score !== undefined && (
                  <span className="text-xs font-semibold text-foreground">
                    Итоговый балл: {selectedCall.score}/13
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" data-testid="cr-criteria-grid">
                {Array.from({ length: 13 }).map((_, idx) => {
                  const val = selectedCall?.cr?.[idx];
                  const label = CR_LABELS[idx] || `Критерий ${idx + 1}`;
                  const isPassed = val === 1;
                  const isFailed = val === 0;

                  const colorClass = isPassed
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'
                    : isFailed
                    ? 'bg-red-500/10 border-red-500/20 text-red-500'
                    : 'bg-hover border-subtle text-muted-foreground';

                  return (
                    <div
                      key={idx}
                      data-testid={`cr-item-${idx + 1}`}
                      className={`flex items-center justify-between p-2 rounded-md border text-xs transition-colors ${colorClass}`}
                    >
                      <div className="flex items-center space-x-2 truncate">
                        <span className="font-mono font-bold shrink-0">CR{idx + 1}</span>
                        <span className="truncate text-foreground/90">{label}</span>
                      </div>
                      <span className="font-bold shrink-0 ml-2">
                        {isPassed ? '1' : isFailed ? '0' : 'null'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Error Summary & Recommendation */}
            {(selectedCall?.error_summary || selectedCall?.recommendation) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                {selectedCall.error_summary && (
                  <div className="p-3 rounded-md bg-red-500/10 border border-red-500/20 space-y-1">
                    <h5 className="font-semibold text-red-500">Ошибки звонка</h5>
                    <p className="text-foreground leading-relaxed">{selectedCall.error_summary}</p>
                  </div>
                )}
                {selectedCall.recommendation && (
                  <div className="p-3 rounded-md bg-emerald-500/10 border border-emerald-500/20 space-y-1">
                    <h5 className="font-semibold text-emerald-500">Рекомендация РОПа</h5>
                    <p className="text-foreground leading-relaxed">{selectedCall.recommendation}</p>
                  </div>
                )}
              </div>
            )}

            {/* Transcript */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                Полный транскрипт диалога
              </h4>
              <pre
                className="whitespace-pre-wrap font-sans text-xs bg-hover/50 p-4 rounded-md border border-subtle text-foreground leading-relaxed max-h-60 overflow-y-auto"
                data-testid="audit-call-transcript"
              >
                {selectedCall?.transcript || 'Транскрипт отсутствует'}
              </pre>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AuditPage;

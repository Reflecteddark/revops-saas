/**
 * apps/web/src/pages/AuditPage.tsx
 *
 * Calls audit page featuring comprehensive filtering by status, manager, and date period,
 * ROP Leadership Podium, Speech Standards Radar, Skills Heatmap (CR1..CR13),
 * tabular inspection, and modal detailed view with 13 CR criteria audit scores and transcript.
 */

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { ClipboardCheck, Filter, Download, Volume2 } from 'lucide-react';
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
import { RopPodium } from '@/components/RopPodium';
import { SpeechRadarChart } from '@/components/SpeechRadarChart';
import { SkillsHeatmap } from '@/components/SkillsHeatmap';
import { useActiveTenantSafe } from '@/hooks/useActiveTenant';
import { callsApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { Call } from '@/types/api';

import { CR_DEFINITIONS, CR_LABELS } from '@/lib/criteria';
export { CR_DEFINITIONS, CR_LABELS };

const auditColumns: ColumnDef<Call, unknown>[] = [
  {
    accessorKey: 'date',
    header: 'Дата',
    cell: ({ row }) => (
      <span className="whitespace-nowrap font-mono text-xs text-muted-foreground">
        {row.original.date}
      </span>
    ),
  },
  {
    accessorKey: 'client',
    header: 'Клиент',
    cell: ({ row }) => (
      <span className="font-medium text-foreground">
        {row.original.client || 'Клиент'}
      </span>
    ),
  },
  {
    accessorKey: 'manager',
    header: 'Менеджер',
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">
        {row.original.manager}
      </span>
    ),
  },
  {
    accessorKey: 'stage',
    header: 'Этап',
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">
        {row.original.stage || '—'}
      </span>
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
          className={cn(
            'font-mono tabular-nums',
            score >= 9
              ? 'font-semibold text-emerald-500'
              : score >= 6
                ? 'font-medium text-amber-500'
                : 'font-medium text-red-500'
          )}
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
  const [crFilter, setCrFilter] = React.useState<string>('all');

  const {
    data: calls = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['calls', tenantId, 'all'],
    queryFn: () => callsApi.list({ tenant_id: tenantId! }),
    enabled: Boolean(tenantId),
  });

  if (!tenantId) {
    return (
      <div
        className="flex min-h-[400px] flex-col items-center justify-center p-8 text-center"
        data-testid="empty-tenant-state"
      >
        <div className="mb-4 rounded-full bg-muted p-4">
          <ClipboardCheck className="h-8 w-8 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold tracking-tight">
          Тенант не выбран
        </h2>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Выберите тенант в шапке приложения для просмотра таблицы аудита
          звонков.
        </p>
      </div>
    );
  }

  // Unique managers
  const managers = Array.from(
    new Set(calls.map((c) => c.manager).filter(Boolean))
  );

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
        const diffDays =
          (now.getTime() - callDate.getTime()) / (1000 * 3600 * 24);
        if (periodFilter === '7d' && diffDays > 7) return false;
        if (periodFilter === '30d' && diffDays > 30) return false;
      }
    }
    // CR filter: only calls where specific criterion failed (=== 0)
    if (crFilter !== 'all') {
      const crIndex = parseInt(crFilter, 10);
      if (!isNaN(crIndex)) {
        const val = call.cr?.[crIndex];
        if (val !== 0) return false;
      }
    }
    return true;
  });

  const handleExportCsv = () => {
    if (filteredCalls.length === 0) return;
    const headers = [
      'Дата',
      'Клиент',
      'Менеджер',
      'Этап',
      'Оценка',
      'Статус',
      ...CR_DEFINITIONS.map((c) => `${c.id.toUpperCase()}_${c.shortLabel}`),
    ];
    const rows = filteredCalls.map((c) => [
      c.date || c.created_at || '',
      `"${(c.client || '').replace(/"/g, '""')}"`,
      `"${(c.manager || '').replace(/"/g, '""')}"`,
      `"${(c.stage || '').replace(/"/g, '""')}"`,
      c.score ?? '—',
      c.status || '',
      ...CR_DEFINITIONS.map((_, idx) => (c.cr && c.cr[idx] !== undefined ? c.cr[idx] : '')),
    ]);
    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `revops-audit-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-balance text-2xl font-bold tracking-tight text-foreground">
              Аудит звонков
            </h1>
            <Badge
              variant="outline"
              className="font-mono text-xs tabular-nums"
              data-testid="calls-count"
            >
              {filteredCalls.length}
            </Badge>
          </div>
          <p className="mt-0.5 text-pretty text-sm text-muted-foreground">
            Детализированный реестр звонков с проверкой 13 критериев B2B-продаж.
          </p>
        </div>
      </div>

      {/* Error Alert */}
      {isError && (
        <Alert
          variant="destructive"
          className="flex items-center justify-between"
          data-testid="audit-error"
        >
          <div>
            <AlertTitle>Ошибка загрузки</AlertTitle>
            <AlertDescription>
              Не удалось загрузить реестр звонков для тенанта {tenantId}.
            </AlertDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="ml-4 shrink-0"
          >
            Повторить
          </Button>
        </Alert>
      )}

      {/* Sprint 2: ROP Podium & Hazard Rep Alert */}
      <RopPodium
        calls={calls}
        selectedRep={managerFilter !== 'all' ? managerFilter : null}
        onSelectRep={(rep) => setManagerFilter(rep || 'all')}
      />

      {/* Sprint 2: Speech Radar & Skills Heatmap Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <SpeechRadarChart
            calls={calls}
            selectedRep={managerFilter !== 'all' ? managerFilter : null}
            onSelectRep={(rep) => setManagerFilter(rep || 'all')}
          />
        </div>
        <div className="lg:col-span-7">
          <SkillsHeatmap
            calls={calls}
            selectedRep={managerFilter !== 'all' ? managerFilter : null}
            onSelectRep={(rep) => setManagerFilter(rep || 'all')}
          />
        </div>
      </div>

      {/* Filters Bar */}
      <div className="surface flex flex-wrap items-center gap-3 p-3">
        <div className="mr-1 flex items-center space-x-2 text-xs font-medium text-muted-foreground">
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
              <SelectItem value="all" className="text-xs">
                Все статусы
              </SelectItem>
              <SelectItem value="won" className="text-xs">
                Успешно (won)
              </SelectItem>
              <SelectItem value="lost" className="text-xs">
                Отказ (lost)
              </SelectItem>
              <SelectItem value="fake_yes" className="text-xs">
                Fake Yes
              </SelectItem>
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
              <SelectItem value="all" className="text-xs">
                Все менеджеры
              </SelectItem>
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
              <SelectItem value="all" className="text-xs">
                За все время
              </SelectItem>
              <SelectItem value="7d" className="text-xs">
                Последние 7 дней
              </SelectItem>
              <SelectItem value="30d" className="text-xs">
                Последние 30 дней
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* CR criteria failure filter */}
        <div className="w-[180px]">
          <Select value={crFilter} onValueChange={setCrFilter}>
            <SelectTrigger className="h-8 text-xs" data-testid="filter-cr">
              <SelectValue placeholder="Критерий" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">
                Все критерии
              </SelectItem>
              {CR_DEFINITIONS.map((cr, idx) => (
                <SelectItem key={cr.id} value={String(idx)} className="text-xs">
                  Провал: {cr.id.toUpperCase()} ({cr.shortLabel})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {(statusFilter !== 'all' ||
          managerFilter !== 'all' ||
          periodFilter !== 'all' ||
          crFilter !== 'all') && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setStatusFilter('all');
              setManagerFilter('all');
              setPeriodFilter('all');
              setCrFilter('all');
            }}
            className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            Сбросить
          </Button>
        )}

        {/* CSV Export Button */}
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs font-medium sm:ml-auto"
          onClick={handleExportCsv}
          data-testid="btn-export-csv"
        >
          <Download className="h-3.5 w-3.5" />
          <span>Скачать CSV</span>
        </Button>
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
      <Dialog
        open={Boolean(selectedCall)}
        onOpenChange={(open) => !open && setSelectedCall(null)}
      >
        <DialogContent
          className="flex max-h-[90vh] max-w-3xl flex-col"
          data-testid="audit-dialog"
        >
          <DialogHeader>
            <DialogTitle>
              {selectedCall?.deal_title || selectedCall?.client || 'Звонок'}
            </DialogTitle>
            <DialogDescription>
              Менеджер: {selectedCall?.manager} | Дата: {selectedCall?.date} |
              Длительность: {selectedCall?.duration || '—'}
            </DialogDescription>
          </DialogHeader>

          {/* Audio Player */}
          {(selectedCall?.audio_url || (selectedCall as any)?.audio_s3_url) && (
            <div className="mt-3 rounded-lg border border-subtle bg-hover p-3">
              <audio
                controls
                className="w-full h-8"
                src={selectedCall?.audio_url || (selectedCall as any)?.audio_s3_url}
                data-testid="audit-call-audio-player"
              />
            </div>
          )}

          <div className="mt-2 flex-1 space-y-5 overflow-y-auto pr-1">
            {/* 13 CR Criteria visualization */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  13 Критериев аудита (CR1 – CR13)
                </h4>
                {selectedCall?.score !== null &&
                  selectedCall?.score !== undefined && (
                    <span className="text-xs font-semibold text-foreground">
                      Итоговый балл: {selectedCall.score}/13
                    </span>
                  )}
              </div>

              <div
                className="grid grid-cols-1 gap-2 sm:grid-cols-2"
                data-testid="cr-criteria-grid"
              >
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
                      title={CR_DEFINITIONS[idx]?.description}
                      className={`flex items-center justify-between rounded-md border p-2 text-xs transition-colors cursor-help ${colorClass}`}
                    >
                      <div className="flex items-center space-x-2 truncate">
                        <span className="shrink-0 font-mono font-bold">
                          CR{idx + 1}
                        </span>
                        <span className="text-foreground/90 truncate">
                          {label}
                        </span>
                      </div>
                      <span className="ml-2 shrink-0 font-mono font-bold">
                        {val === 1 ? '1' : val === 0 ? '0' : '—'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Error Summary */}
            {selectedCall?.error_summary && (
              <div>
                <h4 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Причина потери / Замечания
                </h4>
                <p className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400">
                  {selectedCall.error_summary}
                </p>
              </div>
            )}

            {/* AI Recommendation */}
            {selectedCall?.recommendation && (
              <div>
                <h4 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Рекомендация РОПа
                </h4>
                <p className="rounded-md border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-400">
                  {selectedCall.recommendation}
                </p>
              </div>
            )}

            {/* Transcript */}
            <div>
              <h4 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Транскрипт звонка
              </h4>
              <div
                className="bg-muted/40 max-h-[300px] overflow-y-auto whitespace-pre-wrap rounded-md border p-4 font-sans text-xs leading-relaxed text-foreground"
                data-testid="audit-call-transcript"
              >
                {selectedCall?.transcript || 'Транскрипт отсутствует'}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AuditPage;

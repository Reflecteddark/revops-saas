/**
 * apps/web/src/pages/AuditPage.tsx
 *
 * Calls audit page: KPI row, leaderboard, speech radar, skills heatmap, briefing, a filterable table of calls and a
 * dialog with the 13 criteria and the transcript.
 *
 * Filters: "Период" decides WHICH CALLS the page is about (KPI, podium, radar, heatmap and briefing all follow it);
 * status, manager and criterion only narrow the TABLE, so the manager picked in a widget does not empty the widgets.
 * Counting is in lib/callStats.ts: only rated calls make averages, a missed call and a failed audit have their own
 * status and no score.
 */

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { ClipboardCheck, Filter, Download, PhoneOff, TriangleAlert } from 'lucide-react';
import { DataTable } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RopPodium } from '@/components/RopPodium';
import { SpeechRadarChart } from '@/components/SpeechRadarChart';
import { SkillsHeatmap } from '@/components/SkillsHeatmap';
import { RopBriefingCard } from '@/components/RopBriefingCard';
import { useActiveTenantSafe } from '@/hooks/useActiveTenant';
import { callsApi } from '@/lib/api';
import { callKind, hasCrmManager, ruPlural, summarizeCalls } from '@/lib/callStats';
import { callInstant } from '@/lib/dates';
import { getCallScoreBand, NEXT_STEP_MIN_PCT } from '@/lib/thresholds';
import { cn } from '@/lib/utils';
import type { Call } from '@/types/api';

import { CR_DEFINITIONS, CR_LABELS } from '@/lib/criteria';
export { CR_DEFINITIONS, CR_LABELS };

const BAND_TEXT = {
  high: 'font-semibold text-emerald-500',
  mid: 'font-medium text-amber-500',
  low: 'font-medium text-red-500',
  unrated: 'text-muted-foreground',
} as const;

const STATUS_STYLE: Record<string, { label: string; className: string }> = {
  won: { label: 'ЭТАЛОН', className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500' },
  norm: { label: 'НОРМА', className: 'border-amber-500/30 bg-amber-500/10 text-amber-500' },
  risk: { label: 'СРЫВ', className: 'border-red-500/30 bg-red-500/10 text-red-500' },
  unanswered: { label: 'НЕДОЗВОН', className: 'border-subtle bg-hover text-muted-foreground' },
  audit_failed: { label: 'СБОЙ АНАЛИЗА', className: 'border-subtle bg-hover text-muted-foreground' },
  unknown: { label: 'НЕТ ДАННЫХ', className: 'border-subtle bg-hover text-muted-foreground' },
};

const STATUS_OPTIONS: [string, string][] = [
  ['won', 'Эталон (9–13)'],
  ['norm', 'Норма (6–8)'],
  ['risk', 'Срыв (0–5)'],
  ['unanswered', 'Недозвон'],
  ['audit_failed', 'Сбой анализа'],
  ['unknown', 'Нет данных'],
];

const fmtDate = (d?: string) => {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/.exec(d || '');
  return m ? `${m[1]} ${m[2]}` : d || '—';
};

/** "0:00" is how an unknown duration arrives. */
const fmtDuration = (d?: string) => (!d || d === '0:00' ? '—' : d);

function statusOf(c: Call) {
  return STATUS_STYLE[c.status] ?? { label: c.status_label || c.status || '—', className: 'border-subtle bg-hover text-secondary' };
}

const nextStepText = (c: Call) => (c.next_step === 1 ? 'Есть' : c.next_step === 0 ? 'Нет' : '—');

const auditColumns: ColumnDef<Call, unknown>[] = [
  {
    accessorKey: 'date',
    header: 'Дата',
    cell: ({ row }) => (
      <span className="whitespace-nowrap font-mono text-xs text-muted-foreground">{fmtDate(row.original.date)}</span>
    ),
  },
  {
    accessorKey: 'client',
    header: 'Клиент',
    cell: ({ row }) => <span className="font-medium text-foreground">{row.original.client || '—'}</span>,
  },
  {
    accessorKey: 'manager',
    header: 'Менеджер',
    cell: ({ row }) => (
      <span className={cn('text-xs', hasCrmManager(row.original) ? 'text-muted-foreground' : 'italic text-muted-foreground/70')}>
        {row.original.manager || '—'}
      </span>
    ),
  },
  {
    accessorKey: 'stage',
    header: 'Этап',
    cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.stage || '—'}</span>,
  },
  {
    accessorKey: 'duration',
    header: 'Длительность',
    cell: ({ row }) => (
      <span className="font-mono text-xs text-muted-foreground">{fmtDuration(row.original.duration)}</span>
    ),
  },
  {
    accessorKey: 'score',
    header: 'Балл',
    cell: ({ row }) => {
      const score = row.original.score;
      if (score === null || score === undefined) return <span className="text-muted-foreground">—</span>;
      return <span className={cn('font-mono tabular-nums', BAND_TEXT[getCallScoreBand(score)])}>{score}/13</span>;
    },
  },
  {
    accessorKey: 'next_step',
    header: 'Next Step',
    cell: ({ row }) => {
      const c = row.original;
      return (
        <span
          className={cn(
            'text-xs',
            c.next_step === 1 ? 'font-medium text-emerald-500' : c.next_step === 0 ? 'font-medium text-red-500' : 'text-muted-foreground'
          )}
          title="Назначен ли конкретный следующий шаг с датой и временем (CR1)"
        >
          {nextStepText(c)}
        </span>
      );
    },
  },
  {
    accessorKey: 'status',
    header: 'Статус',
    cell: ({ row }) => {
      const s = statusOf(row.original);
      return (
        <Badge variant="outline" className={cn('font-semibold', s.className)}>
          {s.label}
        </Badge>
      );
    },
  },
];

function KpiTile({ label, value, hint, tone, testId }: { label: string; value: string; hint?: string; tone?: string; testId: string }) {
  return (
    <div className="surface rounded-xl border border-subtle p-3" data-testid={testId}>
      <div className="text-[11px] font-medium text-tertiary">{label}</div>
      <div className={cn('mt-0.5 font-mono text-xl font-bold tabular-nums', tone ?? 'text-foreground')}>{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-tertiary">{hint}</div>}
    </div>
  );
}

export function AuditPage() {
  const tenantId = useActiveTenantSafe();
  const [selectedCall, setSelectedCall] = React.useState<Call | null>(null);

  const [statusFilter, setStatusFilter] = React.useState<string>('all');
  const [managerFilter, setManagerFilter] = React.useState<string>('all');
  const [periodFilter, setPeriodFilter] = React.useState<string>('all');
  const [crFilter, setCrFilter] = React.useState<string>('all');
  const [hoveredCriterion, setHoveredCriterion] = React.useState<number | null>(null);

  const {
    data: calls = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['calls', tenantId, 'all'],
    queryFn: () => callsApi.list({ tenant_id: tenantId!, limit: 500 }), // the API default is 50
    enabled: Boolean(tenantId),
  });

  // The calls the page is about: the period decides, everything else narrows the table only.
  const periodCalls = React.useMemo(() => {
    if (periodFilter === 'all') return calls;
    const days = periodFilter === '7d' ? 7 : 30;
    const now = Date.now();
    return calls.filter((call) => {
      const at = callInstant(call.date); // Moscow wall time / DD.MM.YYYY / ISO (see lib/dates.ts)
      return at !== null && (now - at.getTime()) / (1000 * 3600 * 24) <= days;
    });
  }, [calls, periodFilter]);

  const summary = React.useMemo(() => summarizeCalls(periodCalls), [periodCalls]);

  // A column that is empty for every call is just a row of dashes: the client and the stage come from the CRM deal
  const columns = React.useMemo(
    () =>
      auditColumns.filter((col) => {
        const key = (col as { accessorKey?: string }).accessorKey;
        if (key === 'client') return calls.some((c) => c.client);
        if (key === 'stage') return calls.some((c) => c.stage);
        return true;
      }),
    [calls]
  );

  const managers = React.useMemo(
    () => Array.from(new Set(calls.map((c) => c.manager).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ru')),
    [calls]
  );

  const filteredCalls = React.useMemo(
    () =>
      periodCalls.filter((call) => {
        if (statusFilter !== 'all' && call.status !== statusFilter) return false;
        if (managerFilter !== 'all' && call.manager !== managerFilter) return false;
        // criterion filter: calls where this criterion was assessed and failed (index '0'..'12')
        if (crFilter !== 'all') {
          const crIndex = parseInt(crFilter, 10);
          if (!isNaN(crIndex) && crIndex >= 0 && crIndex < 13 && call.cr?.[crIndex] !== 0) return false;
        }
        return true;
      }),
    [periodCalls, statusFilter, managerFilter, crFilter]
  );

  if (!tenantId) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center p-8 text-center" data-testid="empty-tenant-state">
        <div className="mb-4 rounded-full bg-muted p-4">
          <ClipboardCheck className="h-8 w-8 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold tracking-tight">Тенант не выбран</h2>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Выберите тенант в шапке приложения для просмотра таблицы аудита звонков.
        </p>
      </div>
    );
  }

  const handleExportCsv = () => {
    if (filteredCalls.length === 0) return;
    const headers = [
      'Дата',
      'Клиент',
      'Менеджер',
      'Этап',
      'Длительность',
      'Оценка',
      'Next Step',
      'Статус',
      ...CR_DEFINITIONS.map((c) => `${c.id.toUpperCase()}_${c.shortLabel}`),
    ];
    const quote = (v: string) => `"${(v || '').replace(/"/g, '""')}"`;
    const rows = filteredCalls.map((c) => [
      fmtDate(c.date || c.created_at),
      quote(c.client),
      quote(c.manager),
      quote(c.stage),
      fmtDuration(c.duration),
      c.score ?? '',
      nextStepText(c),
      statusOf(c).label,
      ...CR_DEFINITIONS.map((_, idx) => (c.cr && c.cr[idx] !== undefined && c.cr[idx] !== null ? c.cr[idx] : '')),
    ]);
    const csvContent = '﻿' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const filterPrefix = crFilter !== 'all' ? `cr${parseInt(crFilter, 10) + 1}-` : '';
    link.setAttribute('download', `revops-audit-${filterPrefix}${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const hasFilters = statusFilter !== 'all' || managerFilter !== 'all' || periodFilter !== 'all' || crFilter !== 'all';
  const notRated = summary.total - summary.assessed;
  const avgBand = getCallScoreBand(summary.avgScore);
  const kind = selectedCall ? callKind(selectedCall) : 'assessed';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center space-x-2.5">
            <h1 className="text-balance text-2xl font-bold tracking-tight text-foreground">🎙️ ИИ-Аудит звонков</h1>
            <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
              13 критериев B2B
            </span>
            <Badge
              variant="outline"
              className="font-mono text-xs tabular-nums"
              data-testid="calls-count"
              title="Звонков в таблице с учётом фильтров"
            >
              {filteredCalls.length}
            </Badge>
          </div>
          <p className="mt-0.5 text-pretty text-sm text-muted-foreground">
            Автоматический речевой аудит, выявление системных сливов и подготовка повестки утренней планёрки РОПа.
          </p>
        </div>
      </div>

      {isError && (
        <Alert variant="destructive" className="flex items-center justify-between" data-testid="audit-error">
          <div>
            <AlertTitle>Ошибка загрузки</AlertTitle>
            <AlertDescription>Не удалось загрузить реестр звонков для тенанта {tenantId}.</AlertDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="ml-4 shrink-0">
            Повторить
          </Button>
        </Alert>
      )}

      {/* KPI row: the numbers behind everything below, for the chosen period */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5" data-testid="audit-kpis">
        <KpiTile label="Звонков за период" value={isLoading ? '—' : String(summary.total)} testId="kpi-total" />
        <KpiTile
          label="Оценено ИИ"
          value={isLoading ? '—' : String(summary.assessed)}
          hint="Только они считаются в баллах"
          testId="kpi-assessed"
        />
        <KpiTile
          label="Средний балл"
          value={summary.avgScore === null ? '—' : `${summary.avgScore.toFixed(1)} / 13`}
          tone={summary.avgScore === null ? 'text-tertiary' : BAND_TEXT[avgBand]}
          hint="По оценённым звонкам"
          testId="kpi-avg"
        />
        <KpiTile
          label="Next Step назначен"
          value={summary.nextStepPct === null ? '—' : `${summary.nextStepPct}%`}
          tone={
            summary.nextStepPct === null
              ? 'text-tertiary'
              : summary.nextStepPct >= NEXT_STEP_MIN_PCT
                ? 'text-emerald-500'
                : summary.nextStepPct > 0
                  ? 'text-amber-500'
                  : 'text-red-500'
          }
          hint={summary.nextStepKnown > 0 ? `${summary.nextStepDone} из ${summary.nextStepKnown} оценённых` : undefined}
          testId="kpi-next-step"
        />
        <KpiTile
          label="Не оценены"
          value={isLoading ? '—' : String(notRated)}
          hint={
            notRated > 0
              ? [
                  summary.unanswered > 0 && `${summary.unanswered} ${ruPlural(summary.unanswered, ['недозвон', 'недозвона', 'недозвонов'])}`,
                  summary.failed > 0 && `${summary.failed} ${ruPlural(summary.failed, ['сбой', 'сбоя', 'сбоев'])} анализа`,
                  summary.unrated > 0 && `${summary.unrated} без данных`,
                ]
                  .filter(Boolean)
                  .join(' • ')
              : 'Все звонки оценены'
          }
          testId="kpi-not-rated"
        />
      </div>

      {/* Leaderboard & risk manager */}
      <RopPodium
        calls={periodCalls}
        selectedRep={managerFilter !== 'all' ? managerFilter : null}
        onSelectRep={(rep) => setManagerFilter(rep || 'all')}
      />

      {/* Speech radar & briefing (left) + skills heatmap (right) */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        <div className="flex flex-col space-y-5 lg:col-span-5">
          <SpeechRadarChart
            calls={periodCalls}
            selectedRep={managerFilter !== 'all' ? managerFilter : null}
            onSelectRep={(rep) => setManagerFilter(rep || 'all')}
            hoveredCriterion={hoveredCriterion}
            onHoverCriterion={setHoveredCriterion}
            selectedCriterion={crFilter !== 'all' ? parseInt(crFilter, 10) : null}
            onSelectCriterion={(crIdx) => {
              setCrFilter(crFilter === String(crIdx) ? 'all' : String(crIdx));
            }}
          />
          <RopBriefingCard
            calls={periodCalls}
            onSelectRep={(rep) => setManagerFilter(rep || 'all')}
            onSelectCriterion={(crIdx) => setCrFilter(String(crIdx))}
          />
        </div>
        <div className="lg:col-span-7">
          <SkillsHeatmap
            calls={periodCalls}
            selectedRep={managerFilter !== 'all' ? managerFilter : null}
            selectedCriterion={crFilter !== 'all' ? parseInt(crFilter, 10) : null}
            hoveredCriterion={hoveredCriterion}
            onHoverCriterion={setHoveredCriterion}
            onSelectRep={(rep) => setManagerFilter(rep || 'all')}
            onSelectCriterion={(crIdx) => {
              setCrFilter(crFilter === String(crIdx) ? 'all' : String(crIdx));
            }}
            onSelectCell={(rep, crIdx) => {
              setManagerFilter(rep);
              setCrFilter(String(crIdx));
            }}
          />
        </div>
      </div>

      {/* Filters Bar */}
      <div className="surface flex flex-wrap items-center gap-3 p-3">
        <div className="mr-1 flex items-center space-x-2 text-xs font-medium text-muted-foreground">
          <Filter className="h-4 w-4" />
          <span>Фильтры:</span>
        </div>

        <div className="w-[170px]">
          <Select value={periodFilter} onValueChange={setPeriodFilter}>
            <SelectTrigger className="h-8 text-xs" data-testid="filter-period" title="Период меняет всю страницу">
              <SelectValue placeholder="Период" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">За все время</SelectItem>
              <SelectItem value="7d" className="text-xs">Последние 7 дней</SelectItem>
              <SelectItem value="30d" className="text-xs">Последние 30 дней</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="w-[170px]">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 text-xs" data-testid="filter-status">
              <SelectValue placeholder="Статус" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">Все статусы</SelectItem>
              {STATUS_OPTIONS.map(([value, label]) => (
                <SelectItem key={value} value={value} className="text-xs">
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

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

        <div className="w-[200px]">
          <Select value={crFilter} onValueChange={setCrFilter}>
            <SelectTrigger className="h-8 text-xs" data-testid="filter-cr">
              <SelectValue placeholder="Критерий" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">Все критерии</SelectItem>
              {CR_DEFINITIONS.map((cr, idx) => (
                <SelectItem key={cr.id} value={String(idx)} className="text-xs">
                  Провал: {cr.id.toUpperCase()} ({cr.shortLabel})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {hasFilters && (
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

      <DataTable
        columns={columns}
        data={filteredCalls}
        loading={isLoading}
        emptyMessage={
          calls.length === 0 && !hasFilters
            ? 'Аудированных звонков пока нет: они появятся здесь после первого звонка в CRM'
            : 'Звонков по выбранным критериям не найдено'
        }
        onRowClick={(call) => setSelectedCall(call)}
        pageSize={20}
      />

      {/* Call detail dialog with the 13 criteria */}
      <Dialog open={Boolean(selectedCall)} onOpenChange={(open) => !open && setSelectedCall(null)}>
        <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col" data-testid="audit-dialog">
          <DialogHeader>
            <DialogTitle>{selectedCall?.deal_title || selectedCall?.client || 'Звонок'}</DialogTitle>
            <DialogDescription>
              Менеджер: {selectedCall?.manager || '—'} | Дата: {fmtDate(selectedCall?.date)} | Длительность:{' '}
              {fmtDuration(selectedCall?.duration)} | Next Step: {selectedCall ? nextStepText(selectedCall) : '—'}
            </DialogDescription>
          </DialogHeader>

          {(selectedCall?.audio_url || selectedCall?.audio_s3_url) && (
            <div className="mt-3 rounded-lg border border-subtle bg-hover p-3">
              <audio
                controls
                className="h-8 w-full"
                src={selectedCall?.audio_url || selectedCall?.audio_s3_url}
                data-testid="audit-call-audio-player"
              />
            </div>
          )}

          <div className="mt-2 flex-1 space-y-5 overflow-y-auto pr-1">
            {kind === 'unanswered' && (
              <div className="flex items-start gap-2 rounded-md border border-subtle bg-hover p-3 text-xs text-secondary" data-testid="audit-notice-unanswered">
                <PhoneOff className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Разговор не состоялся (автоответчик или сброс). Такой звонок не оценивается и не влияет на баллы менеджера.</span>
              </div>
            )}
            {kind === 'audit_failed' && (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-500" data-testid="audit-notice-failed">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <span>ИИ не смог разобрать запись, поэтому оценки нет. Баллы менеджера от этого не страдают.</span>
              </div>
            )}

            {/* 13 CR criteria */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  13 Критериев аудита (CR1 – CR13)
                </h4>
                {selectedCall?.score !== null && selectedCall?.score !== undefined && (
                  <span className="text-xs font-semibold text-foreground">Итоговый балл: {selectedCall.score}/13</span>
                )}
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" data-testid="cr-criteria-grid">
                {Array.from({ length: 13 }).map((_, idx) => {
                  const val = selectedCall?.cr?.[idx];
                  const label = CR_LABELS[idx] || `Критерий ${idx + 1}`;
                  const colorClass =
                    val === 1
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'
                      : val === 0
                        ? 'bg-red-500/10 border-red-500/20 text-red-500'
                        : 'bg-hover border-subtle text-muted-foreground';

                  return (
                    <div
                      key={idx}
                      data-testid={`cr-item-${idx + 1}`}
                      title={CR_DEFINITIONS[idx]?.description}
                      className={`flex cursor-help items-center justify-between rounded-md border p-2 text-xs transition-colors ${colorClass}`}
                    >
                      <div className="flex items-center space-x-2 truncate">
                        <span className="shrink-0 font-mono font-bold">CR{idx + 1}</span>
                        <span className="truncate text-foreground/90">{label}</span>
                      </div>
                      <span className="ml-2 shrink-0 font-mono font-bold">{val === 1 ? '1' : val === 0 ? '0' : '—'}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {selectedCall?.error_summary && (
              <div>
                <h4 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">Замечания ИИ</h4>
                <p className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400">
                  {selectedCall.error_summary}
                </p>
              </div>
            )}

            {selectedCall?.recommendation && (
              <div>
                <h4 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">Рекомендация</h4>
                <p className="rounded-md border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-400">
                  {selectedCall.recommendation}
                </p>
              </div>
            )}

            <div>
              <h4 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">Транскрипт звонка</h4>
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

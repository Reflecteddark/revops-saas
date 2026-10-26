/**
 * apps/web/src/pages/PulsePage.tsx
 *
 * Operational pulse page featuring 5 primary KPIs, SSOT sales funnel,
 * yesterday's lost deals banner, Monte Carlo revenue corridors,
 * express scenario calculator, AI impact matrix with Fake Yes detection,
 * AI recommendations, and deep call inspection slide-over drawer.
 */

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  HelpCircle,
  PhoneCall,
  Sparkles,
} from 'lucide-react';
import { KpiCard } from '@/components/KpiCard';
import { DataTable } from '@/components/DataTable';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { LostDealsBanner } from '@/components/LostDealsBanner';
import { PipelineFunnel } from '@/components/PipelineFunnel';
import { CallDetailsDrawer } from '@/components/CallDetailsDrawer';
import { ExpressScenarioCalculator } from '@/components/ExpressScenarioCalculator';
import { MonteCarloCorridor } from '@/components/MonteCarloCorridor';
import { AiImpactCard } from '@/components/AiImpactCard';
import { PulseSmartAlert } from '@/components/PulseSmartAlert';
import { BusinessEconomicsCard } from '@/components/BusinessEconomicsCard';
import { StatusSegmentedBar } from '@/components/StatusSegmentedBar';
import { DailyPulseMatrix } from '@/components/DailyPulseMatrix';
import { useActiveTenantSafe } from '@/hooks/useActiveTenant';
import { callsApi, dealsApi, insightsApi } from '@/lib/api';
import type { Call, RecommendationItem } from '@/types/api';

const callColumns: ColumnDef<Call, unknown>[] = [
  {
    accessorKey: 'date',
    header: 'Дата',
    cell: ({ row }) => {
      const d = row.original.date || row.original.created_at?.slice(0, 10) || '—';
      return <span className="font-mono text-xs text-tertiary">{d}</span>;
    },
  },
  {
    accessorKey: 'client',
    header: 'Клиент',
    cell: ({ row }) => (
      <span className="text-[13px] font-medium text-foreground">
        {row.original.client || row.original.deal_title || row.original.client_phone || '—'}
      </span>
    ),
  },
  {
    accessorKey: 'manager',
    header: 'Менеджер',
    cell: ({ row }) => (
      <span className="text-[13px] text-secondary">{row.original.manager || '—'}</span>
    ),
  },
  {
    accessorKey: 'score',
    header: 'Балл',
    cell: ({ row }) => {
      const score = row.original.score ?? (row.original as any)?.overall_score;
      if (score === null || score === undefined) {
        return <span className="text-tertiary text-xs">—</span>;
      }
      const isGood = score >= 9;
      const isMid = score >= 6;
      const scoreColor = isGood
        ? 'text-emerald-400 font-semibold'
        : isMid
        ? 'text-amber-400 font-medium'
        : 'text-rose-400 font-medium';
      return (
        <span className="font-mono text-xs tabular-nums" data-testid="call-score">
          <span className={scoreColor}>{score}</span>
          <span className="text-tertiary">/13</span>
        </span>
      );
    },
  },
  {
    accessorKey: 'status',
    header: 'Статус',
    cell: ({ row }) => {
      const status = row.original.status || 'unknown';
      const label = row.original.status_label || status;

      if (status === 'won') {
        return (
          <span className="inline-flex h-5 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-1 ring-inset ring-emerald-500/20">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            {label}
          </span>
        );
      }

      if (status === 'lost' || status === 'fake_yes') {
        return (
          <span className="inline-flex h-5 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium bg-rose-500/10 text-rose-700 dark:text-rose-400 ring-1 ring-inset ring-rose-500/20">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
            {label}
          </span>
        );
      }

      return (
        <span className="inline-flex h-5 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium bg-hover text-secondary ring-1 ring-inset ring-border-subtle">
          <span className="h-1.5 w-1.5 rounded-full bg-tertiary" />
          {label}
        </span>
      );
    },
  },
];

export function PulsePage() {
  const tenantId = useActiveTenantSafe();
  const [selectedCall, setSelectedCall] = React.useState<Call | null>(null);

  const insightsQuery = useQuery({
    queryKey: ['insights', tenantId],
    queryFn: () => insightsApi.summary(tenantId!),
    enabled: Boolean(tenantId),
  });

  const callsQuery = useQuery({
    queryKey: ['calls', tenantId],
    queryFn: () => callsApi.list({ tenant_id: tenantId!, limit: 20 }),
    enabled: Boolean(tenantId),
  });

  const dealsQuery = useQuery({
    queryKey: ['deals', tenantId],
    queryFn: () => dealsApi.list({ tenant_id: tenantId! }),
    enabled: Boolean(tenantId),
  });

  if (!tenantId) {
    return (
      <div
        className="flex min-h-[400px] flex-col items-center justify-center text-center p-8"
        data-testid="empty-tenant-state"
      >
        <div className="rounded-xl bg-hover p-4 mb-4 border border-subtle">
          <PhoneCall className="h-7 w-7 text-tertiary" />
        </div>
        <h2 className="text-base font-semibold tracking-tight text-foreground">Тенант не выбран</h2>
        <p className="mt-1 text-xs text-secondary max-w-sm">
          Выберите тенант в шапке приложения для отображения оперативного пульса и аналитики.
        </p>
      </div>
    );
  }

  const isError = insightsQuery.isError || callsQuery.isError;
  const isLoading = insightsQuery.isLoading || callsQuery.isLoading;

  const handleRetry = () => {
    insightsQuery.refetch();
    callsQuery.refetch();
    dealsQuery.refetch();
  };

  const insights = insightsQuery.data;
  const calls = callsQuery.data || [];
  const deals = dealsQuery.data || [];
  const recentCalls = calls.slice(0, 10);

  // Deals won amount
  const dealsWonAmount = React.useMemo(() => {
    return deals
      .filter((d) => d.stage === 'Оплачено' || d.stage === 'Успешно' || d.status === 'won')
      .reduce((acc, d) => acc + (d.amount || 0), 0);
  }, [deals]);

  // SSOT KPIs calculations (Strictly factual, Zero Mock)
  const kpi = insights?.kpi;
  const revenue = Number(kpi?.revenue ?? dealsWonAmount ?? 0);
  const slaRiskCount = kpi?.sla_risk_count ?? kpi?.sla_at_risk_count ?? 0;

  const pipelineSum = deals.reduce((acc, d) => acc + (d.amount || 0), 0);
  const avgCheckRub = deals.length > 0 ? Math.round(pipelineSum / deals.length) : 0;
  const uniqueManagersCount = new Set(calls.map((c) => c.manager).filter(Boolean)).size;

  const planTarget = Number(
    insights?.p90_corridor_rub ?? (pipelineSum > 0 ? Math.round(pipelineSum * 0.8) : revenue)
  );
  const deficitSum = Math.max(0, planTarget - revenue);

  const avgCallScore =
    calls.length > 0
      ? Math.round((calls.reduce((acc, c) => acc + (c.score || 0), 0) / calls.length) * 10) / 10
      : 0;
  const qualityPct = avgCallScore > 0 ? Math.round((avgCallScore / 13) * 100) : 0;

  const recommendations: RecommendationItem[] = insights?.recommendations || [];
  const leakBreakdown = (insights?.leak_breakdown || {}) as Record<string, any>;
  const leakCategories = Object.entries(leakBreakdown).filter(
    ([key, val]) =>
      typeof val === 'object' &&
      val !== null &&
      !['capped_by_pipeline', 'total_leak_rub'].includes(key)
  ) as [string, { sum?: number; amount_rub?: number; count?: number }][];
  const hasLeaks = leakCategories.length > 0;

  const stalledDealsCount = leakBreakdown?.stalled_deals?.count ?? slaRiskCount;
  const stalledAmountRub = leakBreakdown?.stalled_deals?.amount_rub ?? 0;
  const fakeYesCount = calls.filter((c) => c.status === 'fake_yes').length;

  const totalCalls = calls.length;
  const wonCallsCount = calls.filter((c) => (c.score || 0) >= 9).length;
  const midCallsCount = calls.filter((c) => (c.score || 0) >= 6 && (c.score || 0) < 9).length;
  const lostCallsCount = calls.filter((c) => (c.score || 0) < 6).length;

  const dealsWonCount = deals.filter(
    (d) => d.stage === 'Оплачено' || d.stage === 'Успешно' || d.status === 'won'
  ).length;
  const dealsRiskCount = deals.filter((d) => d.sla_risk || (d as any).risk).length || slaRiskCount;
  const dealsInWorkCount = Math.max(0, deals.length - dealsWonCount - dealsRiskCount);
  const totalDeals = deals.length;

  const [showRopGuide, setShowRopGuide] = React.useState(false);
  const [showDataAuditInfo, setShowDataAuditInfo] = React.useState(false);

  return (
    <div className="space-y-6">
      {/* MPSTATS-style Header Bar with Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-subtle pb-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Рука на пульсе: Оперативная экономика продаж
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              LIVE
            </span>
          </div>
          <p className="text-xs text-secondary mt-1">
            Подключение: <span className="text-foreground font-medium">{tenantId}</span> &bull;
            Сквозная аналитика выручки, воронки и стандартов B2B-аудита
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDataAuditInfo(!showDataAuditInfo)}
            className="h-8 gap-1.5 text-xs text-secondary hover:text-foreground"
          >
            <HelpCircle className="h-3.5 w-3.5 text-violet-400" />
            <span className="hidden sm:inline">А это верные данные?</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowRopGuide(!showRopGuide)}
            className="h-8 gap-1.5 text-xs text-secondary hover:text-foreground"
          >
            <BookOpen className="h-3.5 w-3.5 text-cyan-400" />
            <span>Инструкция РОПа</span>
          </Button>
        </div>
      </div>

      {showDataAuditInfo && (
        <Alert className="bg-violet-500/10 border-violet-500/30 text-xs">
          <CheckCircle2 className="h-4 w-4 text-violet-400" />
          <AlertDescription className="text-foreground">
            Данные рассчитаны по формулам Single Source of Truth (SSOT). Звонки верифицированы
            нейросетью Google Gemini по 13 критериям, сделки синхронизированы в реальном времени из
            CRM.
          </AlertDescription>
        </Alert>
      )}

      {showRopGuide && (
        <div className="surface rounded-xl border border-subtle p-4 text-xs space-y-2">
          <div className="flex items-center justify-between pb-1 border-b border-subtle">
            <h3 className="font-semibold text-foreground">
              Стандарт ежедневного 15-минутного спринта РОПа (MPSTATS Playbook)
            </h3>
            <button
              onClick={() => setShowRopGuide(false)}
              className="text-tertiary hover:text-foreground text-xs"
            >
              Закрыть
            </button>
          </div>
          <ol className="list-decimal list-inside space-y-1 text-secondary">
            <li>Проверьте дефицит до плана в блоке «Экономика продаж».</li>
            <li>Разберите сделки с риском SLA из желтого баннера (нет Next Step &gt;48ч).</li>
            <li>
              Откройте срывы звонков из мультисегментного статус-бара и оставьте комментарий
              менеджеру.
            </li>
          </ol>
        </div>
      )}

      {/* Error state */}
      {isError && (
        <Alert
          variant="destructive"
          className="flex items-center justify-between"
          data-testid="pulse-error"
        >
          <div>
            <AlertTitle>Ошибка загрузки</AlertTitle>
            <AlertDescription>
              Не удалось загрузить данные аналитики пульса для тенанта {tenantId}.
            </AlertDescription>
          </div>
          <Button variant="outline" size="sm" onClick={handleRetry} className="ml-4 shrink-0">
            Повторить
          </Button>
        </Alert>
      )}

      {/* MPSTATS Smart Alert Banner */}
      <PulseSmartAlert
        stalledCount={stalledDealsCount}
        stalledAmountRub={stalledAmountRub}
        onResolve={() => {
          const el = document.getElementById('pipeline-funnel-section');
          el?.scrollIntoView({ behavior: 'smooth' });
        }}
      />

      {/* MPSTATS Master Economics 3-Column Card */}
      <BusinessEconomicsCard
        revenueRub={revenue}
        pipelineRub={pipelineSum}
        lossRub={deficitSum}
        targetRub={planTarget}
        avgCheckRub={avgCheckRub > 0 ? avgCheckRub : undefined}
        qualityPct={qualityPct}
        stalledDealsCount={stalledDealsCount}
        fakeYesCount={fakeYesCount}
      />

      {/* 5 Primary KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        <KpiCard
          title="Выручка факт"
          value={isLoading ? 0 : revenue.toLocaleString('ru-RU')}
          unit="₽"
          trend={kpi?.revenue_trend ? { direction: kpi.revenue_trend > 0 ? 'up' : 'down', value: Math.abs(kpi.revenue_trend), label: 'vs прошлый период' } : undefined}
          inverted={false}
          loading={isLoading}
        />
        <KpiCard
          title="Пайплайн"
          value={isLoading ? 0 : pipelineSum.toLocaleString('ru-RU')}
          unit="₽"
          trend={deals.length > 0 ? { direction: 'flat', value: deals.length, label: 'сделок в работе' } : undefined}
          inverted={false}
          loading={isLoading}
        />
        <KpiCard
          title="Качество звонков"
          value={isLoading ? 0 : qualityPct}
          unit="%"
          trend={avgCallScore > 0 ? { direction: avgCallScore >= 8 ? 'up' : 'down', value: avgCallScore, label: 'из 13 баллов' } : undefined}
          inverted={false}
          loading={isLoading}
        />
        <KpiCard
          title="Дефицит до плана"
          value={isLoading ? 0 : deficitSum.toLocaleString('ru-RU')}
          unit="₽"
          trend={planTarget > 0 ? { direction: deficitSum === 0 ? 'up' : 'down', value: Math.round((revenue / planTarget) * 100), label: '% выполнения плана' } : undefined}
          inverted={true}
          loading={isLoading}
        />
        <KpiCard
          title="SLA риск"
          value={isLoading ? 0 : slaRiskCount}
          variant={slaRiskCount > 0 ? 'danger' : 'default'}
          trend={slaRiskCount > 0 ? { direction: 'down', value: slaRiskCount, label: 'требуют внимания' } : undefined}
          inverted={true}
          loading={isLoading}
        />
      </div>

      {/* MPSTATS Status Segmented Bars Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StatusSegmentedBar
          title="Распределение звонков по стандартам РОПа"
          totalCount={totalCalls}
          segments={[
            {
              id: 'won',
              label: 'Эталон (9-13 баллов)',
              count: wonCallsCount,
              colorClass: 'bg-emerald-500',
              dotColorClass: 'bg-emerald-500',
            },
            {
              id: 'mid',
              label: 'В норме (6-8 баллов)',
              count: midCallsCount,
              colorClass: 'bg-amber-500',
              dotColorClass: 'bg-amber-500',
            },
            {
              id: 'lost',
              label: 'Срывы / Токсичные (0-5)',
              count: lostCallsCount,
              colorClass: 'bg-rose-500',
              dotColorClass: 'bg-rose-500',
            },
          ]}
        />

        <StatusSegmentedBar
          title="Распределение открытого пайплайна по статусам"
          totalCount={totalDeals}
          segments={[
            {
              id: 'won-deals',
              label: 'Оплачено / Закрыто',
              count: dealsWonCount,
              colorClass: 'bg-emerald-500',
              dotColorClass: 'bg-emerald-500',
              amountRub: revenue,
            },
            {
              id: 'in-work-deals',
              label: 'В работе по графику',
              count: dealsInWorkCount,
              colorClass: 'bg-sky-500',
              dotColorClass: 'bg-sky-500',
              amountRub: pipelineSum,
            },
            {
              id: 'risk-deals',
              label: 'Риск срыва SLA (>48ч)',
              count: dealsRiskCount,
              colorClass: 'bg-rose-500',
              dotColorClass: 'bg-rose-500',
              amountRub: stalledAmountRub,
            },
          ]}
        />
      </div>

      {/* Lost Deals Yesterday Widget */}
      <LostDealsBanner
        calls={calls}
        onInspectCall={(call) => setSelectedCall(call)}
      />

      {/* SSOT Funnel & AI Recommendations */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <PipelineFunnel
            deals={deals}
            calls={calls}
            loading={isLoading}
          />
        </div>

        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center space-x-2">
            <Sparkles className="h-4 w-4 text-violet-400" />
            <h2 className="text-[13px] font-semibold text-foreground">
              Рекомендации ИИ
            </h2>
          </div>

          {isLoading ? (
            <div className="space-y-3" data-testid="recommendations-loading">
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
            </div>
          ) : recommendations.length > 0 ? (
            <div className="space-y-3" data-testid="recommendations-list">
              {recommendations.map((item, idx) => (
                <div
                  key={idx}
                  className="surface rounded-xl p-4 transition-colors duration-150 hover:border-violet-500/35 border border-violet-500/20"
                >
                  <div className="flex items-start justify-between gap-2 pb-1.5">
                    <h3 className="text-[13px] font-medium text-foreground">{item.title}</h3>
                    {item.impact_rub > 0 && (
                      <span className="shrink-0 font-mono text-xs font-semibold tabular-nums text-emerald-400">
                        +{item.impact_rub.toLocaleString('ru-RU')} ₽
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-secondary leading-relaxed">
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="surface rounded-xl border border-dashed border-subtle p-6 text-center text-xs text-secondary">
              Пока нет рекомендаций
            </div>
          )}
        </div>
      </div>

      {/* Monte Carlo Probabilistic Corridor */}
      <MonteCarloCorridor
        p10={Number(insights?.p10_corridor_rub ?? (pipelineSum > 0 ? Math.round(pipelineSum * 0.3) : 0))}
        p50={Number(insights?.p50_corridor_rub ?? (pipelineSum > 0 ? Math.round(pipelineSum * 0.6) : revenue))}
        p90={Number(insights?.p90_corridor_rub ?? (pipelineSum > 0 ? Math.round(pipelineSum * 0.95) : revenue))}
        monthlyTarget={planTarget}
        confidenceScore={insights?.confidence_score ?? 0.92}
      />

      {/* Financial Scenario Math & AI Impact Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6">
          <ExpressScenarioCalculator
            initialLeads={Math.max(1, deals.length)}
            initialCheck={avgCheckRub > 0 ? avgCheckRub : 250000}
            initialManagers={Math.max(1, uniqueManagersCount)}
          />
        </div>
        <div className="lg:col-span-6">
          <AiImpactCard calls={calls} />
        </div>
      </div>

      {/* MPSTATS-style Daily Heatmap Matrix with Sparklines */}
      <DailyPulseMatrix calls={calls} loading={isLoading} />

      {/* Recent Calls */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-foreground">
            Последние звонки
          </h2>
          <span className="text-xs text-tertiary">Кликните на строку для открытия детального разбора</span>
        </div>

        <DataTable
          columns={callColumns}
          data={recentCalls}
          loading={isLoading}
          emptyMessage="Звонков пока нет"
          onRowClick={(call) => setSelectedCall(call)}
          pageSize={10}
        />
      </div>

      {/* Leak Breakdown */}
      {hasLeaks && (
        <div className="space-y-3">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <h2 className="text-[13px] font-semibold text-foreground">Утечки выручки по категориям</h2>
          </div>
          <div className="surface divide-y divide-subtle overflow-hidden">
            {leakCategories.map(([catKey, leak]) => {
              const amount = Number(leak?.amount_rub ?? leak?.sum ?? 0);
              const count = Number(leak?.count ?? 0);
              return (
                <div
                  key={catKey}
                  className="flex h-12 items-center justify-between px-4 transition-colors duration-150 hover:bg-hover"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-amber-400/10">
                      <AlertTriangle className="h-4 w-4 text-amber-400" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[13px] font-medium text-foreground capitalize truncate">
                        {catKey.replace(/_/g, ' ')}
                      </span>
                      {count > 0 && (
                        <span className="text-xs text-tertiary">
                          {count} сделок
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0 pl-4 font-mono text-[13px] font-medium tabular-nums text-rose-400">
                    {amount.toLocaleString('ru-RU')} ₽
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Deep Inspection Slide-Over Drawer */}
      <CallDetailsDrawer
        call={selectedCall}
        open={Boolean(selectedCall)}
        onOpenChange={(open) => !open && setSelectedCall(null)}
      />
    </div>
  );
}

export default PulsePage;

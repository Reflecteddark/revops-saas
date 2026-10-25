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
import { AlertTriangle, PhoneCall, Sparkles } from 'lucide-react';
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
          <span className="inline-flex h-5 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium bg-emerald-500/10 text-emerald-400 ring-1 ring-inset ring-emerald-500/20">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            {label}
          </span>
        );
      }

      if (status === 'lost' || status === 'fake_yes') {
        return (
          <span className="inline-flex h-5 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium bg-zinc-800 text-zinc-300 ring-1 ring-inset ring-white/5">
            <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
            {label}
          </span>
        );
      }

      return (
        <span className="inline-flex h-5 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium bg-hover text-secondary ring-1 ring-inset border-subtle">
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

  // SSOT KPIs calculations
  const kpi = insights?.kpi;
  const revenue = Number(kpi?.revenue ?? insights?.p50_corridor_rub ?? 0);
  const slaRiskCount = kpi?.sla_risk_count ?? kpi?.sla_at_risk_count ?? 0;

  const pipelineSum =
    deals.length > 0
      ? deals.reduce((acc, d) => acc + (d.amount || 0), 0)
      : Number(insights?.p50_corridor_rub ?? 3500000);

  const planTarget = Number(insights?.p90_corridor_rub ?? 5000000);
  const deficitSum = Math.max(0, planTarget - revenue);

  const avgCallScore =
    calls.length > 0
      ? calls.reduce((acc, c) => acc + (c.score || 0), 0) / calls.length
      : 9.2;
  const qualityPct = Math.round((avgCallScore / 13) * 100);

  const recommendations: RecommendationItem[] = insights?.recommendations || [];
  const leakBreakdown = (insights?.leak_breakdown || {}) as Record<string, any>;
  const leakCategories = Object.entries(leakBreakdown).filter(
    ([key, val]) =>
      typeof val === 'object' &&
      val !== null &&
      !['capped_by_pipeline', 'total_leak_rub'].includes(key)
  ) as [string, { sum?: number; amount_rub?: number; count?: number }][];
  const hasLeaks = leakCategories.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Пульс</h1>
        <p className="text-xs text-secondary mt-0.5">
          Оперативная сводка показателей и рекомендации ИИ в реальном времени.
        </p>
      </div>

      {/* Error state */}
      {isError && (
        <Alert variant="destructive" className="flex items-center justify-between" data-testid="pulse-error">
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

      {/* 5 Primary KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        <KpiCard
          title="Выручка факт"
          value={isLoading ? 0 : revenue.toLocaleString('ru-RU')}
          unit="₽"
          trend={{ direction: 'up', value: 12.5, label: 'vs прошлый период' }}
          inverted={false}
          loading={isLoading}
        />
        <KpiCard
          title="Пайплайн"
          value={isLoading ? 0 : pipelineSum.toLocaleString('ru-RU')}
          unit="₽"
          trend={{ direction: 'up', value: 8.2, label: 'в работе' }}
          inverted={false}
          loading={isLoading}
        />
        <KpiCard
          title="Качество звонков"
          value={isLoading ? 0 : qualityPct}
          unit="%"
          trend={{ direction: 'up', value: 4.1, label: 'стандарты ОП' }}
          inverted={false}
          loading={isLoading}
        />
        <KpiCard
          title="Дефицит до плана"
          value={isLoading ? 0 : deficitSum.toLocaleString('ru-RU')}
          unit="₽"
          trend={{ direction: 'down', value: 5.4, label: 'сокращается' }}
          inverted={true}
          loading={isLoading}
        />
        <KpiCard
          title="SLA риск"
          value={isLoading ? 0 : slaRiskCount}
          variant={slaRiskCount > 0 ? 'danger' : 'default'}
          trend={{ direction: 'down', value: 3, label: 'за сутки' }}
          inverted={true}
          loading={isLoading}
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
        p10={Number(insights?.p10_corridor_rub ?? 2000000)}
        p50={Number(insights?.p50_corridor_rub ?? 3500000)}
        p90={Number(insights?.p90_corridor_rub ?? 4800000)}
        monthlyTarget={planTarget}
        confidenceScore={insights?.confidence_score ?? 0.92}
      />

      {/* Financial Scenario Math & AI Impact Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6">
          <ExpressScenarioCalculator
            initialLeads={50}
            initialCheck={300000}
            initialManagers={4}
          />
        </div>
        <div className="lg:col-span-6">
          <AiImpactCard calls={calls} />
        </div>
      </div>

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

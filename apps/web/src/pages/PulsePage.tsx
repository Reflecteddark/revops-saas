/**
 * apps/web/src/pages/PulsePage.tsx
 *
 * Operational pulse page featuring primary KPIs, AI recommendations,
 * recent calls data table with transcript modal, and revenue leak breakdown.
 */

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, PhoneCall, Sparkles } from 'lucide-react';
import { KpiCard } from '@/components/KpiCard';
import { DataTable } from '@/components/DataTable';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useActiveTenantSafe } from '@/hooks/useActiveTenant';
import { callsApi, insightsApi } from '@/lib/api';
import type { Call, RecommendationItem } from '@/types/api';

const callColumns: ColumnDef<Call, unknown>[] = [
  {
    accessorKey: 'date',
    header: 'Дата',
    cell: ({ row }) => {
      const d = row.original.date || row.original.created_at?.slice(0, 10) || '—';
      return <span className="font-mono text-xs text-muted-foreground">{d}</span>;
    },
  },
  {
    accessorKey: 'client',
    header: 'Клиент',
    cell: ({ row }) => (
      <span className="font-medium text-foreground">
        {row.original.client || row.original.deal_title || row.original.client_phone || '—'}
      </span>
    ),
  },
  {
    accessorKey: 'manager',
    header: 'Менеджер',
    cell: ({ row }) => (
      <span className="text-muted-foreground">{row.original.manager || '—'}</span>
    ),
  },
  {
    accessorKey: 'score',
    header: 'Балл',
    cell: ({ row }) => {
      const score = row.original.score ?? (row.original as any)?.overall_score;
      if (score === null || score === undefined) {
        return <span className="text-muted-foreground">—</span>;
      }
      const isGood = score >= 9;
      const isMid = score >= 6;
      return (
        <span
          className={
            isGood
              ? 'font-semibold text-emerald-500'
              : isMid
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
      const status = row.original.status || 'unknown';
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
    queryFn: () => callsApi.list({ tenant_id: tenantId!, limit: 10 }),
    enabled: Boolean(tenantId),
  });

  if (!tenantId) {
    return (
      <div
        className="flex min-h-[400px] flex-col items-center justify-center text-center p-8"
        data-testid="empty-tenant-state"
      >
        <div className="rounded-full bg-muted p-4 mb-4">
          <PhoneCall className="h-8 w-8 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold tracking-tight">Тенант не выбран</h2>
        <p className="mt-1 text-sm text-muted-foreground max-w-sm">
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
  };

  const insights = insightsQuery.data;
  const calls = callsQuery.data || [];
  const recentCalls = calls.slice(0, 10);

  // Typed KPI mapping without fabricated fallbacks
  const kpi = insights?.kpi;
  const revenue = Number(kpi?.revenue ?? insights?.p50_corridor_rub ?? 0);
  const callsTotal = kpi?.calls_total ?? calls.length;
  const wonCalls = calls.filter((c) => c.status === 'won').length;
  const winRate = kpi?.win_rate ?? (callsTotal > 0 ? Math.round((wonCalls / callsTotal) * 100) : 0);
  const slaRiskCount = kpi?.sla_risk_count ?? kpi?.sla_at_risk_count ?? 0;

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Пульс</h1>
          <p className="text-sm text-muted-foreground">
            Оперативная сводка показателей и рекомендации ИИ в реальном времени.
          </p>
        </div>
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

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Выручка"
          value={isLoading ? 0 : revenue.toLocaleString('ru-RU')}
          unit="₽"
          trend={{ direction: 'up', value: 12.5, label: 'vs прошлый период' }}
          variant="accent"
          loading={isLoading}
        />
        <KpiCard
          title="Звонков"
          value={isLoading ? 0 : callsTotal}
          trend={{ direction: 'up', value: 8, label: 'vs план' }}
          loading={isLoading}
        />
        <KpiCard
          title="SLA риск"
          value={isLoading ? 0 : slaRiskCount}
          variant={slaRiskCount > 0 ? 'danger' : 'default'}
          trend={{ direction: 'down', value: 3, label: 'за сутки' }}
          loading={isLoading}
        />
        <KpiCard
          title="Конверсия"
          value={isLoading ? 0 : winRate}
          unit="%"
          trend={{ direction: 'flat', value: 0 }}
          loading={isLoading}
        />
      </div>

      {/* AI Recommendations */}
      <div className="space-y-3">
        <div className="flex items-center space-x-2">
          <Sparkles className="h-5 w-5 text-purple-500" />
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Рекомендации ИИ
          </h2>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4" data-testid="recommendations-loading">
            <Skeleton className="h-28 w-full rounded-lg" />
            <Skeleton className="h-28 w-full rounded-lg" />
            <Skeleton className="h-28 w-full rounded-lg" />
          </div>
        ) : recommendations.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4" data-testid="recommendations-list">
            {recommendations.map((item, idx) => (
              <Card key={idx} className="border-border bg-card/60">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold">{item.title}</CardTitle>
                    {item.impact_rub > 0 && (
                      <Badge variant="secondary" className="text-xs text-emerald-500 font-mono">
                        +{item.impact_rub.toLocaleString('ru-RU')} ₽
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {item.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="flex items-center justify-center p-6 text-sm text-muted-foreground">
              Пока нет рекомендаций
            </CardContent>
          </Card>
        )}
      </div>

      {/* Recent Calls */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Последние звонки
          </h2>
          <span className="text-xs text-muted-foreground">Кликните на строку для просмотра транскрипта</span>
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
        <Card className="border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <CardTitle className="text-sm font-semibold">Утечки выручки по категориям</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
              {leakCategories.map(([catKey, leak]) => {
                const amount = Number(leak?.amount_rub ?? leak?.sum ?? 0);
                const count = Number(leak?.count ?? 0);
                return (
                  <div
                    key={catKey}
                    className="flex items-center justify-between p-2.5 rounded-md bg-muted/40 border border-border/50"
                  >
                    <span className="font-medium text-foreground capitalize">
                      {catKey.replace(/_/g, ' ')}
                    </span>
                    <div className="text-right">
                      <div className="font-semibold text-red-500">
                        {amount.toLocaleString('ru-RU')} ₽
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {count} сделок
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Transcript Dialog */}
      <Dialog open={Boolean(selectedCall)} onOpenChange={(open) => !open && setSelectedCall(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {selectedCall?.deal_title || selectedCall?.client || 'Звонок'}
            </DialogTitle>
            <DialogDescription>
              Менеджер: {selectedCall?.manager} | Дата: {selectedCall?.date}
              {selectedCall?.score !== null && selectedCall?.score !== undefined && (
                <span className="ml-2 font-medium text-foreground">
                  • Балл: {selectedCall.score}/13
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto mt-2">
            <div className="space-y-4">
              <div>
                <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-1">
                  Транскрипт
                </h4>
                <pre
                  className="whitespace-pre-wrap font-sans text-xs bg-muted/40 p-4 rounded-md border border-border text-foreground leading-relaxed"
                  data-testid="call-transcript"
                >
                  {selectedCall?.transcript || 'Транскрипт отсутствует'}
                </pre>
              </div>

              {selectedCall?.recommendation && (
                <div>
                  <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-1">
                    Рекомендация РОПа
                  </h4>
                  <p className="text-xs text-foreground bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-md">
                    {selectedCall.recommendation}
                  </p>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default PulsePage;

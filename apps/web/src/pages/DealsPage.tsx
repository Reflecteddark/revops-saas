/**
 * apps/web/src/pages/DealsPage.tsx
 *
 * Enterprise Revenue Intelligence Platform for Deals & Funnel.
 * Features:
 * - Multi-Pipeline Switcher (amoCRM pipelines & Bitrix24 deal categories)
 * - Executive Revenue Control Strip (Nominal Pipeline, Weighted Forecast, Pipeline at Risk, Velocity)
 * - Smart Deal Cards in Kanban (Health Score 0-100, Velocity / Stagnation, Divergence Alerts, AI Next Best Action)
 * - Focus Mode: Радар рисков SLA (Executive table for 15-min daily sales standups)
 * - High-density Tabular registry with multi-criteria filters
 * - One-click CRM direct resync
 */

import * as React from 'react';
import {
  Columns,
  Table as TableIcon,
  Search,
  RefreshCw,
  AlertTriangle,
  Phone,
  XCircle,
  Activity,
  TrendingUp,
  Clock,
  ShieldAlert,
  Sparkles,
  Zap,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { dealsApi } from '@/lib/api';
import { useRevOpsStore } from '@/store/useRevOpsStore';
import { DealDetailsDrawer } from '@/components/DealDetailsDrawer';
import {
  computeDealHealth,
  isDealClosed,
  cleanEntityTitle,
  DealHealthMetrics,
} from '@/lib/dealHealth';
import type { Deal, Pipeline } from '@/types/api';

type ViewMode = 'kanban' | 'radar' | 'table';
type QuickFilter = 'all' | 'risk' | 'stalled' | 'divergence' | 'sla';

interface DealWithHealth extends Deal {
  health: DealHealthMetrics;
}

export function DealsPage() {
  const activeTenantId = useRevOpsStore((s) => s.activeTenantId) || 'TNT-001';

  // State
  const [viewMode, setViewMode] = React.useState<ViewMode>('kanban');
  const [activeFilter, setActiveFilter] = React.useState<QuickFilter>('all');
  const [pipelines, setPipelines] = React.useState<Pipeline[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] =
    React.useState<string>('');
  const [deals, setDeals] = React.useState<Deal[]>([]);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [syncing, setSyncing] = React.useState<boolean>(false);
  const [search, setSearch] = React.useState<string>('');
  const [slaRiskOnly, setSlaRiskOnly] = React.useState<boolean>(false);
  const [lossReasonFilter, setLossReasonFilter] = React.useState<string>('all');
  const [selectedDeal, setSelectedDeal] = React.useState<Deal | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState<boolean>(false);

  // Request sequence ref to prevent out-of-order async race conditions
  const dealsReqSeq = React.useRef(0);

  // Fetch Deals for specific pipeline ID
  const fetchDeals = React.useCallback(
    async (pipeId: string) => {
      const seq = ++dealsReqSeq.current;
      setLoading(true);
      try {
        const data = await dealsApi.list({
          tenant_id: activeTenantId,
          pipeline_id: pipeId && pipeId !== 'all' ? pipeId : undefined,
        });
        if (seq === dealsReqSeq.current) {
          setDeals(data);
        }
      } catch (err) {
        console.warn('Failed to load deals:', err);
      } finally {
        if (seq === dealsReqSeq.current) {
          setLoading(false);
        }
      }
    },
    [activeTenantId]
  );

  // Coordinated init effect: fetch pipelines first, determine active pipeline, then fetch its deals
  React.useEffect(() => {
    let cancelled = false;
    async function loadData() {
      setLoading(true);
      try {
        const pipes = await dealsApi.pipelines(activeTenantId);
        if (cancelled) return;
        setPipelines(pipes);

        const initialPipe = pipes.find((p) => p.is_main) || pipes[0];
        const initialPipeId = initialPipe ? initialPipe.id : 'all';
        setSelectedPipelineId(initialPipeId);

        await fetchDeals(initialPipeId);
      } catch (err) {
        console.warn('Failed to initialize deals and pipelines:', err);
        if (!cancelled) setLoading(false);
      }
    }
    loadData();
    return () => {
      cancelled = true;
    };
  }, [activeTenantId, fetchDeals]);

  // Handle pipeline switcher change
  const handlePipelineChange = (newPipeId: string) => {
    setSelectedPipelineId(newPipeId);
    fetchDeals(newPipeId);
  };

  // Trigger On-demand CRM sync
  const handleSync = async () => {
    setSyncing(true);
    try {
      await dealsApi.sync(activeTenantId);
      const pipes = await dealsApi.pipelines(activeTenantId);
      setPipelines(pipes);
      const activePipeId =
        selectedPipelineId ||
        pipes.find((p) => p.is_main)?.id ||
        pipes[0]?.id ||
        'all';
      await fetchDeals(activePipeId);
    } catch (err) {
      console.error('CRM sync error:', err);
    } finally {
      setSyncing(false);
    }
  };

  const activePipeline = React.useMemo(() => {
    return (
      pipelines.find((p) => p.id === selectedPipelineId) ||
      pipelines[0] || {
        id: '0',
        name: 'Основная воронка',
        stages: [
          { id: '1', name: 'Новый лид', color: '#39A8EF' },
          { id: '2', name: 'Квалификация', color: '#2FC6F6' },
          { id: '3', name: 'Встреча / Демо', color: '#55D0E0' },
          { id: '4', name: 'КП / В работе', color: '#47E4C2' },
          { id: '5', name: 'Финальный счёт', color: '#FFA900' },
          {
            id: '6',
            name: 'Успешно реализовано',
            color: '#7BD500',
            is_won: true,
          },
          {
            id: '7',
            name: 'Закрыто и не реализовано',
            color: '#FF5752',
            is_lost: true,
          },
        ],
      }
    );
  }, [pipelines, selectedPipelineId]);

  // Compute Health Metrics for all deals
  const dealsWithHealth: DealWithHealth[] = React.useMemo(() => {
    return deals.map((d) => ({
      ...d,
      health: computeDealHealth(d),
    }));
  }, [deals]);

  // Extract all unique loss reasons for filter dropdown
  const uniqueLossReasons = React.useMemo(() => {
    const reasons = new Set<string>();
    deals.forEach((d) => {
      if (d.loss_reason && d.loss_reason.trim()) {
        reasons.add(d.loss_reason.trim());
      }
    });
    return Array.from(reasons);
  }, [deals]);

  // Quick filter counts
  const filterCounts = React.useMemo(() => {
    return {
      all: dealsWithHealth.length,
      risk: dealsWithHealth.filter((d) => d.health.healthTier === 'critical')
        .length,
      stalled: dealsWithHealth.filter((d) => d.health.isStalled).length,
      divergence: dealsWithHealth.filter((d) => d.health.divergenceRisk).length,
      sla: dealsWithHealth.filter(
        (d) => Boolean(d.sla_risk) && !isDealClosed(d)
      ).length,
    };
  }, [dealsWithHealth]);

  // Filter deals based on search, SLA risk, loss reasons, and quick filter pills
  const filteredDeals = React.useMemo(() => {
    return dealsWithHealth.filter((d) => {
      // Quick filter pill
      if (activeFilter === 'risk' && d.health.healthTier !== 'critical')
        return false;
      if (activeFilter === 'stalled' && !d.health.isStalled) return false;
      if (activeFilter === 'divergence' && !d.health.divergenceRisk)
        return false;
      if (activeFilter === 'sla' && (!d.sla_risk || isDealClosed(d)))
        return false;

      // Checkbox SLA filter compatibility
      if (slaRiskOnly && (!d.sla_risk || isDealClosed(d))) return false;

      // Loss reason filter
      if (lossReasonFilter !== 'all' && d.loss_reason !== lossReasonFilter) {
        return false;
      }

      // Search query
      if (search.trim()) {
        const s = search.trim().toLowerCase();
        const titleMatch =
          d.title.toLowerCase().includes(s) ||
          d.health.cleanTitle.toLowerCase().includes(s);
        const compMatch = String(d.company_name || '')
          .toLowerCase()
          .includes(s);
        const managerMatch = String(d.responsible_user || '')
          .toLowerCase()
          .includes(s);
        const idMatch = String(d.crm_deal_id || d.deal_id || '')
          .toLowerCase()
          .includes(s);
        if (!titleMatch && !compMatch && !managerMatch && !idMatch) {
          return false;
        }
      }
      return true;
    });
  }, [dealsWithHealth, activeFilter, search, slaRiskOnly, lossReasonFilter]);

  // Group deals into Kanban columns based on pipeline stages
  const kanbanColumns = React.useMemo(() => {
    const stages = activePipeline.stages || [];
    return stages.map((st) => {
      const stNameLower = st.name.toLowerCase();
      const stageDeals = filteredDeals.filter((d) => {
        const dealStageName = (d.stage_name || d.stage || '').toLowerCase();
        if (dealStageName === stNameLower) return true;
        if (
          st.is_won &&
          (d.status === 'won' || dealStageName.includes('успеш'))
        ) {
          return true;
        }
        if (
          st.is_lost &&
          (d.status === 'lost' ||
            dealStageName.includes('закрыт') ||
            dealStageName.includes('отказ'))
        ) {
          return true;
        }
        return String(d.stage_id) === String(st.id);
      });

      const totalAmount = stageDeals.reduce(
        (sum, d) => sum + (d.amount || 0),
        0
      );

      return {
        stage: st,
        deals: stageDeals,
        totalAmount,
      };
    });
  }, [activePipeline, filteredDeals]);

  // Enterprise Executive Metrics calculations
  const totalDealsCount = filteredDeals.length;
  const totalPipelineAmount = filteredDeals.reduce(
    (sum, d) => sum + (d.amount || 0),
    0
  );
  const weightedForecast = Math.round(
    filteredDeals.reduce(
      (sum, d) => sum + (d.amount || 0) * (d.health.winProbability / 100),
      0
    )
  );
  const pipelineAtRisk = filteredDeals
    .filter(
      (d) =>
        !isDealClosed(d) && (d.health.healthTier === 'critical' || d.sla_risk)
    )
    .reduce((sum, d) => sum + (d.amount || 0), 0);
  const totalSlaRisks = filteredDeals.filter(
    (d) => Boolean(d.sla_risk) && !isDealClosed(d)
  ).length;

  // Stalled and Risk deals for Radar View
  const radarDeals = React.useMemo(() => {
    return dealsWithHealth.filter(
      (d) =>
        !isDealClosed(d) &&
        (d.sla_risk ||
          d.health.healthTier === 'critical' ||
          d.health.isStalled ||
          d.health.divergenceRisk)
    );
  }, [dealsWithHealth]);

  return (
    <div className="space-y-6" data-testid="deals-page">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Сделки и Воронка продаж
          </h1>
          <p className="text-sm text-secondary">
            Revenue Intelligence, мультиворонки CRM, контроль темпа и аудит
            переговоров
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Pipeline Switcher Dropdown */}
          <div className="relative">
            <select
              value={selectedPipelineId}
              onChange={(e) => handlePipelineChange(e.target.value)}
              className="shadow-xs h-9 cursor-pointer rounded-lg border border-subtle bg-surface px-3 py-1.5 pr-8 text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              aria-label="Выбор воронки продаж"
            >
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.deal_count ? `(${p.deal_count} сделок)` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* View Toggle */}
          <div className="shadow-xs flex rounded-lg border border-subtle bg-surface p-0.5">
            <button
              onClick={() => setViewMode('kanban')}
              className={cn(
                'flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors',
                viewMode === 'kanban'
                  ? 'shadow-xs bg-active font-semibold text-foreground'
                  : 'text-tertiary hover:text-foreground'
              )}
            >
              <Columns className="h-3.5 w-3.5" />
              <span>Канбан</span>
            </button>
            <button
              onClick={() => setViewMode('radar')}
              className={cn(
                'flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors',
                viewMode === 'radar'
                  ? 'shadow-xs bg-rose-500/15 font-semibold text-rose-300'
                  : 'text-tertiary hover:text-foreground'
              )}
            >
              <Zap className="h-3.5 w-3.5 text-rose-400" />
              <span>Радар рисков</span>
              {radarDeals.length > 0 && (
                <span className="py-0.2 ml-1 rounded-full bg-rose-500/20 px-1.5 text-[10px] font-bold text-rose-400">
                  {radarDeals.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={cn(
                'flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors',
                viewMode === 'table'
                  ? 'shadow-xs bg-active font-semibold text-foreground'
                  : 'text-tertiary hover:text-foreground'
              )}
            >
              <TableIcon className="h-3.5 w-3.5" />
              <span>Таблица</span>
            </button>
          </div>

          {/* Resync Button */}
          <button
            onClick={handleSync}
            disabled={syncing}
            className="shadow-xs flex h-9 items-center gap-1.5 rounded-lg border border-subtle bg-surface px-3 text-xs font-medium text-foreground transition-colors hover:bg-hover disabled:opacity-50"
            title="Синхронизировать с amoCRM / Bitrix24"
          >
            <RefreshCw
              className={cn(
                'h-3.5 w-3.5',
                syncing && 'animate-spin text-primary'
              )}
            />
            <span>{syncing ? 'Синхронизация...' : 'Синхронизировать'}</span>
          </button>
        </div>
      </div>

      {/* Enterprise Executive Control Strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {/* Card 1: Total Deals */}
        <div className="shadow-xs space-y-1 rounded-xl border border-subtle bg-surface p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-tertiary">Всего сделок</span>
            <Activity className="h-3.5 w-3.5 text-primary" />
          </div>
          <p className="font-mono text-xl font-bold text-foreground">
            {totalDealsCount}
          </p>
          <p className="truncate text-[11px] text-tertiary">
            {activePipeline.name}
          </p>
        </div>

        {/* Card 2: Nominal Pipeline */}
        <div className="shadow-xs space-y-1 rounded-xl border border-subtle bg-surface p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-tertiary">Общий пайплайн</span>
            <span className="font-mono text-[10px] text-tertiary">100%</span>
          </div>
          <p className="font-mono text-xl font-bold text-foreground">
            {totalPipelineAmount.toLocaleString('ru-RU')} ₽
          </p>
          <p className="text-[11px] text-tertiary">Номинальная сумма воронки</p>
        </div>

        {/* Card 3: Weighted AI Forecast */}
        <div className="shadow-xs space-y-1 rounded-xl border border-subtle bg-surface p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-tertiary">Взвешенный прогноз ИИ</span>
            <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
          </div>
          <p className="font-mono text-xl font-bold text-emerald-400">
            {weightedForecast.toLocaleString('ru-RU')} ₽
          </p>
          <p className="text-[11px] text-tertiary">С учётом этапа и звонков</p>
        </div>

        {/* Card 4: Pipeline at Risk */}
        <div className="shadow-xs space-y-1 rounded-xl border border-subtle bg-surface p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-tertiary">Выручка под угрозой</span>
            <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
          </div>
          <p className="font-mono text-xl font-bold text-rose-400">
            {pipelineAtRisk.toLocaleString('ru-RU')} ₽
          </p>
          <p className="text-[11px] text-tertiary">Критический health / риск</p>
        </div>

        {/* Card 5: SLA & Velocity Control */}
        <div className="shadow-xs space-y-1 rounded-xl border border-subtle bg-surface p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-tertiary">
              Риск SLA по регламенту
            </span>
            <Clock className="h-3.5 w-3.5 text-amber-400" />
          </div>
          <p className="font-mono text-xl font-bold text-amber-400">
            {totalSlaRisks}
          </p>
          <p className="text-[11px] text-tertiary">
            {filterCounts.stalled > 0
              ? `${filterCounts.stalled} зависло >3 дней`
              : 'Все в регламенте'}
          </p>
        </div>
      </div>

      {/* Quick Filter Pills & Search Bar */}
      <div className="space-y-3">
        <div className="shadow-xs flex flex-wrap items-center justify-between gap-3 rounded-xl border border-subtle bg-surface p-3">
          {/* Search Box */}
          <div className="flex min-w-[240px] flex-1 items-center gap-2">
            <Search className="h-4 w-4 shrink-0 text-tertiary" />
            <input
              type="text"
              placeholder="Поиск по сделке, компании или менеджеру..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-transparent text-xs text-foreground placeholder:text-tertiary focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* SLA Risk Filter Checkbox */}
            <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-secondary hover:text-foreground">
              <input
                type="checkbox"
                checked={slaRiskOnly}
                onChange={(e) => setSlaRiskOnly(e.target.checked)}
                className="rounded border-subtle text-primary focus:ring-primary"
              />
              <span className="font-semibold text-amber-400">
                Только риск SLA
              </span>
            </label>

            {/* Loss Reason Dropdown */}
            {uniqueLossReasons.length > 0 && (
              <select
                value={lossReasonFilter}
                onChange={(e) => setLossReasonFilter(e.target.value)}
                className="bg-subtle/50 h-8 rounded-lg border border-subtle px-2.5 text-xs text-secondary focus:outline-none"
              >
                <option value="all">Все причины закрытия</option>
                {uniqueLossReasons.map((lr) => (
                  <option key={lr} value={lr}>
                    {lr}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Executive Quick Filter Pills */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setActiveFilter('all')}
            className={cn(
              'h-7 rounded-lg border px-3 text-xs font-medium transition-all',
              activeFilter === 'all'
                ? 'border-primary/50 bg-primary/10 shadow-xs font-semibold text-primary'
                : 'border-subtle bg-surface text-secondary hover:bg-hover hover:text-foreground'
            )}
          >
            Все сделки ({filterCounts.all})
          </button>

          <button
            onClick={() => setActiveFilter('risk')}
            className={cn(
              'flex h-7 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-all',
              activeFilter === 'risk'
                ? 'shadow-xs border-rose-500/50 bg-rose-500/15 font-semibold text-rose-300'
                : 'border-subtle bg-surface text-secondary hover:bg-hover hover:text-rose-400'
            )}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
            <span>Зона риска ({filterCounts.risk})</span>
          </button>

          <button
            onClick={() => setActiveFilter('stalled')}
            className={cn(
              'flex h-7 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-all',
              activeFilter === 'stalled'
                ? 'shadow-xs border-amber-500/50 bg-amber-500/15 font-semibold text-amber-300'
                : 'border-subtle bg-surface text-secondary hover:bg-hover hover:text-amber-400'
            )}
          >
            <Clock className="h-3 w-3 text-amber-400" />
            <span>Зависшие &gt;3 дн. ({filterCounts.stalled})</span>
          </button>

          <button
            onClick={() => setActiveFilter('divergence')}
            className={cn(
              'flex h-7 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-all',
              activeFilter === 'divergence'
                ? 'shadow-xs border-indigo-500/50 bg-indigo-500/15 font-semibold text-indigo-300'
                : 'border-subtle bg-surface text-secondary hover:bg-hover hover:text-indigo-400'
            )}
          >
            <ShieldAlert className="h-3 w-3 text-indigo-400" />
            <span>Расхождения с CRM ({filterCounts.divergence})</span>
          </button>

          <button
            onClick={() => setActiveFilter('sla')}
            className={cn(
              'flex h-7 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-all',
              activeFilter === 'sla'
                ? 'shadow-xs border-amber-500/50 bg-amber-500/15 font-semibold text-amber-300'
                : 'border-subtle bg-surface text-secondary hover:bg-hover hover:text-amber-400'
            )}
          >
            <AlertTriangle className="h-3 w-3 text-amber-400" />
            <span>Риск SLA ({filterCounts.sla})</span>
          </button>
        </div>
      </div>

      {/* Main View Area */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="space-y-3 rounded-xl border border-subtle bg-surface p-4"
            >
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-28 w-full rounded-lg" />
              <Skeleton className="h-28 w-full rounded-lg" />
            </div>
          ))}
        </div>
      ) : viewMode === 'kanban' ? (
        /* ▦ Smart Kanban Board */
        <div className="flex gap-4 overflow-x-auto pb-4">
          {kanbanColumns.map(({ stage, deals: colDeals, totalAmount }) => {
            const stageColor = stage.color || '#9E9E9E';

            return (
              <div
                key={stage.id}
                className="bg-surface/70 shadow-xs flex w-80 shrink-0 flex-col overflow-hidden rounded-xl border border-subtle"
              >
                {/* Column Header */}
                <div
                  className="space-y-1.5 border-b border-subtle bg-surface p-3.5"
                  style={{ borderTop: `3px solid ${stageColor}` }}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="truncate pr-2 text-xs font-bold text-foreground">
                      {stage.name}
                    </h3>
                    <Badge
                      variant="outline"
                      className="px-1.5 py-0 font-mono text-[11px]"
                    >
                      {colDeals.length}
                    </Badge>
                  </div>
                  <p className="font-mono text-[11px] font-medium text-tertiary">
                    {totalAmount.toLocaleString('ru-RU')} ₽
                  </p>
                </div>

                {/* Column Deals List */}
                <div className="max-h-[720px] flex-1 space-y-2.5 overflow-y-auto p-2.5">
                  {colDeals.length === 0 ? (
                    <div className="border-subtle/60 rounded-lg border border-dashed p-4 text-center">
                      <span className="text-[11px] text-tertiary">
                        Нет сделок
                      </span>
                    </div>
                  ) : (
                    colDeals.map((d) => {
                      const healthColor =
                        d.health.healthTier === 'healthy'
                          ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10'
                          : d.health.healthTier === 'warning'
                            ? 'border-amber-500/30 text-amber-400 bg-amber-500/10'
                            : 'border-rose-500/30 text-rose-400 bg-rose-500/10';

                      return (
                        <div
                          key={d.id}
                          onClick={() => {
                            setSelectedDeal(d);
                            setDrawerOpen(true);
                          }}
                          className="shadow-xs hover:border-primary/50 group relative cursor-pointer space-y-2.5 rounded-lg border border-subtle bg-surface p-3.5 transition-all hover:shadow-md"
                        >
                          {/* Card Top Row: Title & Health Score */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 space-y-0.5">
                              <span className="line-clamp-2 text-xs font-semibold text-foreground transition-colors group-hover:text-primary">
                                {cleanEntityTitle(d.company_name) || d.health.cleanTitle}
                              </span>
                              <span className="block font-mono text-[10px] text-tertiary">
                                {d.crm_deal_id || d.id}
                              </span>
                            </div>

                            {/* Health Score Pill */}
                            <Badge
                              variant="outline"
                              className={cn(
                                'shrink-0 px-1.5 py-0 font-mono text-[10px] font-bold',
                                healthColor
                              )}
                              title={`Health Score: ${d.health.healthScore}/100. Win Prob: ${d.health.winProbability}%`}
                            >
                              <Activity className="mr-1 h-2.5 w-2.5" />
                              {d.health.healthScore}
                            </Badge>
                          </div>

                          {/* Amount */}
                          <div className="flex items-baseline justify-between">
                            <span className="font-mono text-sm font-bold text-foreground">
                              {d.amount_str ||
                                `${d.amount?.toLocaleString('ru-RU')} ₽`}
                            </span>
                            <span className="font-mono text-[10px] text-tertiary">
                              ИИ: {d.health.winProbability}%
                            </span>
                          </div>

                          {/* Risk, Velocity and Touchpoint Badges */}
                          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                            {/* Divergence Risk Badge */}
                            {d.health.divergenceRisk && (
                              <Badge
                                variant="outline"
                                className="border-rose-500/40 bg-rose-500/15 px-1.5 py-0 text-[10px] font-semibold text-rose-300"
                                title="Сделка на продвинутом этапе, но аудиты звонков или SLA сигнализируют о срыве"
                              >
                                <ShieldAlert className="mr-1 h-3 w-3 text-rose-400" />
                                Расхождение CRM
                              </Badge>
                            )}

                            {/* SLA Risk Alert Badge */}
                            {d.sla_risk &&
                              !isDealClosed(d) &&
                              !d.health.divergenceRisk && (
                                <Badge
                                  variant="outline"
                                  className="border-amber-500/30 bg-amber-500/10 px-1.5 py-0 text-[10px] font-semibold text-amber-300"
                                >
                                  <AlertTriangle className="mr-1 h-3 w-3 text-amber-400" />
                                  Риск SLA
                                </Badge>
                              )}

                            {/* Velocity / Stagnation Badge - only for open active deals */}
                            {!isDealClosed(d) && (
                              <Badge
                                variant="outline"
                                className={cn(
                                  'px-1.5 py-0 font-mono text-[10px]',
                                  d.health.isStalled
                                    ? 'border-amber-500/40 bg-amber-500/15 font-semibold text-amber-300'
                                    : 'border-subtle text-tertiary'
                                )}
                                title={
                                  d.health.isStalled
                                    ? `Зависла на этапе более ${d.health.daysInStage} дней!`
                                    : `Дней на этапе: ${d.health.daysInStage}`
                                }
                              >
                                <Clock className="mr-1 h-3 w-3" />
                                {d.health.daysInStage} дн.
                              </Badge>
                            )}

                            {/* Loss Reason Badge */}
                            {d.loss_reason && (
                              <Badge
                                variant="outline"
                                className="max-w-[180px] truncate border-rose-500/30 bg-rose-500/10 px-1.5 py-0 text-[10px] font-medium text-rose-300"
                              >
                                <XCircle className="mr-1 h-3 w-3 shrink-0 text-rose-400" />
                                {d.loss_reason}
                              </Badge>
                            )}

                            {/* Calls Count Badge */}
                            {typeof d.calls_count === 'number' &&
                              d.calls_count > 0 && (
                                <Badge
                                  variant="outline"
                                  className="border-primary/30 bg-primary/10 px-1.5 py-0 font-mono text-[10px] text-primary"
                                >
                                  <Phone className="mr-1 h-3 w-3" />
                                  {d.calls_count}
                                  {typeof d.avg_call_score === 'number' && d.avg_call_score > 0
                                    ? ` • ${d.avg_call_score <= 13 ? d.avg_call_score.toFixed(1) + "/13" : Math.round(d.avg_call_score) + "%"}`
                                    : ''}
                                </Badge>
                              )}
                          </div>

                          {/* AI Next Best Action Strip */}
                          <div className="bg-subtle/30 flex items-center gap-1.5 rounded px-2 py-1 text-[11px] text-secondary">
                            <Sparkles className="h-3 w-3 shrink-0 text-amber-400" />
                            <span className="truncate">
                              {d.health.aiNextAction}
                            </span>
                          </div>

                          {/* Responsible Manager */}
                          <div className="border-subtle/50 flex items-center justify-between border-t pt-1.5 text-[11px] text-tertiary">
                            <span className="max-w-[140px] truncate">
                              {d.responsible_user || 'Не назначен'}
                            </span>
                            <span className="font-mono text-[10px]">
                              {d.created_at
                                ? d.created_at.substring(0, 10)
                                : ''}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : viewMode === 'radar' ? (
        /* ⚡ Радар рисков SLA (Focus Mode for РОП Standup) */
        <div className="space-y-4">
          <div className="flex flex-col items-start justify-between gap-3 rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-rose-500/10 p-2 text-rose-400">
                <Zap className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">
                  Радар рисков SLA и зависших сделок
                </h3>
                <p className="text-xs text-secondary">
                  Фокусный реестр для ежедневной 15-минутки РОПа. Сделки с
                  угрозой срыва, нарушением регламента или застоем.
                </p>
              </div>
            </div>
            <Badge
              variant="outline"
              className="border-rose-500/40 font-mono text-rose-300"
            >
              На контроле: {radarDeals.length} сделок
            </Badge>
          </div>

          <div className="shadow-xs overflow-hidden rounded-xl border border-subtle bg-surface">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-subtle/40 border-b border-subtle text-[10px] font-semibold uppercase tracking-wider text-tertiary">
                  <tr>
                    <th className="px-4 py-3">Сделка</th>
                    <th className="px-4 py-3">Health</th>
                    <th className="px-4 py-3 text-right">Сумма</th>
                    <th className="px-4 py-3">Этап / Застой</th>
                    <th className="px-4 py-3">Фактор риска</th>
                    <th className="px-4 py-3">ИИ-Рекомендация РОПу</th>
                    <th className="px-4 py-3">Менеджер</th>
                    <th className="px-4 py-3 text-right">Действие</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-subtle">
                  {radarDeals.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="py-12 text-center text-secondary"
                      >
                        <div className="mx-auto max-w-md space-y-1">
                          <p className="text-sm font-semibold text-emerald-400">
                            Все сделки под контролем!
                          </p>
                          <p className="text-xs text-tertiary">
                            В текущей воронке нет сделок с критическим здоровьем
                            или нарушением SLA.
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    radarDeals.map((d) => (
                      <tr
                        key={d.id}
                        onClick={() => {
                          setSelectedDeal(d);
                          setDrawerOpen(true);
                        }}
                        className="hover:bg-hover/60 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="font-semibold text-foreground">
                            {cleanEntityTitle(d.company_name) || d.health.cleanTitle}
                          </div>
                          <div className="font-mono text-[10px] text-tertiary">
                            {d.crm_deal_id || d.id}
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          <Badge
                            variant="outline"
                            className={cn(
                              'px-2 py-0.5 font-mono text-[11px] font-bold',
                              d.health.healthTier === 'healthy'
                                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                                : d.health.healthTier === 'warning'
                                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                                  : 'border-rose-500/30 bg-rose-500/10 text-rose-400'
                            )}
                          >
                            {d.health.healthScore} / 100
                          </Badge>
                        </td>

                        <td className="px-4 py-3 text-right font-mono font-bold text-foreground">
                          {d.amount_str ||
                            `${d.amount?.toLocaleString('ru-RU')} ₽`}
                        </td>

                        <td className="px-4 py-3">
                          <div className="font-medium text-foreground">
                            {d.stage_name || d.stage}
                          </div>
                          <span
                            className={cn(
                              'font-mono text-[10px]',
                              d.health.isStalled
                                ? 'font-semibold text-amber-400'
                                : 'text-tertiary'
                            )}
                          >
                            ⏳ {d.health.daysInStage} дней на этапе
                          </span>
                        </td>

                        <td className="px-4 py-3">
                          {d.health.divergenceRisk ? (
                            <Badge
                              variant="outline"
                              className="border-rose-500/40 bg-rose-500/15 text-[10px] text-rose-300"
                            >
                              ⚡ Расхождение с CRM
                            </Badge>
                          ) : d.sla_risk && !isDealClosed(d) ? (
                            <Badge
                              variant="outline"
                              className="border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-300"
                            >
                              ⚠️ Просрочен регламент
                            </Badge>
                          ) : d.health.isStalled ? (
                            <Badge
                              variant="outline"
                              className="border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-300"
                            >
                              ⏳ Застой сделки
                            </Badge>
                          ) : (
                            <span className="text-[11px] text-tertiary">
                              Низкий скоринг
                            </span>
                          )}
                        </td>

                        <td className="max-w-xs truncate px-4 py-3 text-secondary">
                          <span className="flex items-center gap-1.5">
                            <Sparkles className="h-3 w-3 shrink-0 text-amber-400" />
                            <span>{d.health.aiNextAction}</span>
                          </span>
                        </td>

                        <td className="px-4 py-3 text-secondary">
                          {d.responsible_user || 'Не назначен'}
                        </td>

                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedDeal(d);
                              setDrawerOpen(true);
                            }}
                            className="inline-flex items-center gap-1 rounded-md border border-subtle bg-surface px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-hover"
                          >
                            <span>Аудит</span>
                            <ChevronRight className="h-3 w-3" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* 📋 High-density Table View */
        <div className="shadow-xs overflow-hidden rounded-xl border border-subtle bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-subtle/40 border-b border-subtle text-[10px] font-semibold uppercase tracking-wider text-tertiary">
                <tr>
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">Сделка / Клиент</th>
                  <th className="px-4 py-3">Воронка</th>
                  <th className="px-4 py-3">Этап</th>
                  <th className="px-4 py-3 text-right">Сумма</th>
                  <th className="px-4 py-3">Health Score</th>
                  <th className="px-4 py-3">Менеджер</th>
                  <th className="px-4 py-3 text-center">Звонки</th>
                  <th className="px-4 py-3">Статус / Причина</th>
                  <th className="px-4 py-3">Дата</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-subtle">
                {filteredDeals.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-8 text-center text-tertiary">
                      Сделки не найдены
                    </td>
                  </tr>
                ) : (
                  filteredDeals.map((d) => (
                    <tr
                      key={d.id}
                      onClick={() => {
                        setSelectedDeal(d);
                        setDrawerOpen(true);
                      }}
                      className="hover:bg-hover/60 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 font-mono text-[11px] text-tertiary">
                        {d.crm_deal_id || d.deal_id || d.id}
                      </td>

                      <td className="px-4 py-3">
                        <div className="font-semibold text-foreground">
                          {cleanEntityTitle(d.company_name) || d.health.cleanTitle}
                        </div>
                        {d.company_name && d.title !== d.company_name && (
                          <div className="text-[11px] text-secondary">
                            {d.health.cleanTitle}
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3 text-secondary">
                        {d.pipeline_name || activePipeline.name}
                      </td>

                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">
                          {d.stage_name || d.stage}
                        </div>
                        <span className="font-mono text-[10px] text-tertiary">
                          ⏳ {d.health.daysInStage} дн.
                        </span>
                      </td>

                      <td className="px-4 py-3 text-right font-mono font-bold text-foreground">
                        {d.amount_str ||
                          `${d.amount?.toLocaleString('ru-RU')} ₽`}
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={cn(
                              'font-mono text-[11px] font-bold',
                              d.health.healthTier === 'healthy'
                                ? 'text-emerald-400'
                                : d.health.healthTier === 'warning'
                                  ? 'text-amber-400'
                                  : 'text-rose-400'
                            )}
                          >
                            {d.health.healthScore}
                          </span>
                          <span className="text-[10px] text-tertiary">
                            (ИИ: {d.health.winProbability}%)
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-3 text-secondary">
                        {d.responsible_user || 'Не назначен'}
                      </td>

                      <td className="px-4 py-3 text-center">
                        {typeof d.calls_count === 'number' &&
                        d.calls_count > 0 ? (
                          <Badge
                            variant="outline"
                            className="border-primary/30 font-mono text-[10px] text-primary"
                          >
                            📞 {d.calls_count}
                          </Badge>
                        ) : (
                          <span className="text-tertiary">—</span>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        {d.loss_reason ? (
                          <Badge
                            variant="outline"
                            className="border-rose-500/30 bg-rose-500/10 text-[10px] text-rose-300"
                          >
                            {d.loss_reason}
                          </Badge>
                        ) : d.sla_risk && !isDealClosed(d) ? (
                          <Badge
                            variant="outline"
                            className="border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-300"
                          >
                            Риск SLA
                          </Badge>
                        ) : d.status === 'won' ? (
                          <Badge
                            variant="outline"
                            className="border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-400"
                          >
                            Успешно
                          </Badge>
                        ) : (
                          <span className="text-[11px] text-tertiary">
                            В работе
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 font-mono text-[11px] text-tertiary">
                        {d.created_at ? d.created_at.substring(0, 10) : ''}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Slide-over Deal Details Drawer */}
      <DealDetailsDrawer
        deal={selectedDeal}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        tenantId={activeTenantId}
      />
    </div>
  );
}

/**
 * apps/web/src/pages/DealsPage.tsx
 *
 * Deals and Sales Pipeline Management Page.
 * Features:
 * - Multi-Pipeline Switcher (amoCRM pipelines & Bitrix24 deal categories)
 * - Dynamic Stages Kanban Board with custom CRM colors
 * - Tabular view with search and filters (SLA risk, Loss reasons, Manager)
 * - Slide-Over Deal Drawer with Whisper audio audits and 13 criteria scorecard
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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { dealsApi } from '@/lib/api';
import { useRevOpsStore } from '@/store/useRevOpsStore';
import { DealDetailsDrawer } from '@/components/DealDetailsDrawer';
import type { Deal, Pipeline } from '@/types/api';

type ViewMode = 'kanban' | 'table';

export function DealsPage() {
  const activeTenantId = useRevOpsStore((s) => s.activeTenantId) || 'TNT-001';

  // State
  const [viewMode, setViewMode] = React.useState<ViewMode>('kanban');
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

  // Filter deals based on search, SLA risk, and loss reasons
  const filteredDeals = React.useMemo(() => {
    return deals.filter((d) => {
      if (slaRiskOnly && !d.sla_risk) return false;
      if (lossReasonFilter !== 'all' && d.loss_reason !== lossReasonFilter)
        return false;
      if (search.trim()) {
        const s = search.trim().toLowerCase();
        const titleMatch = d.title.toLowerCase().includes(s);
        const compMatch = String(d.company_name || '')
          .toLowerCase()
          .includes(s);
        const managerMatch = String(d.responsible_user || '')
          .toLowerCase()
          .includes(s);
        const idMatch = String(d.crm_deal_id || d.deal_id || '')
          .toLowerCase()
          .includes(s);
        if (!titleMatch && !compMatch && !managerMatch && !idMatch)
          return false;
      }
      return true;
    });
  }, [deals, search, slaRiskOnly, lossReasonFilter]);

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
        )
          return true;
        if (
          st.is_lost &&
          (d.status === 'lost' ||
            dealStageName.includes('закрыт') ||
            dealStageName.includes('отказ'))
        )
          return true;
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

  const totalDealsCount = filteredDeals.length;
  const totalPipelineAmount = filteredDeals.reduce(
    (sum, d) => sum + (d.amount || 0),
    0
  );
  const totalSlaRisks = filteredDeals.filter((d) => d.sla_risk).length;

  return (
    <div className="space-y-6" data-testid="deals-page">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Сделки и Воронка продаж
          </h1>
          <p className="text-sm text-secondary">
            Мультиворонки CRM, кастомные этапы, контроль SLA и аналитика причин
            отказа
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Pipeline Switcher Dropdown */}
          <div className="relative">
            <select
              value={selectedPipelineId}
              onChange={(e) => handlePipelineChange(e.target.value)}
              className="h-9 cursor-pointer rounded-lg border border-subtle bg-surface px-3 py-1.5 pr-8 text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
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
          <div className="flex rounded-lg border border-subtle bg-surface p-0.5">
            <button
              onClick={() => setViewMode('kanban')}
              className={cn(
                'flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors',
                viewMode === 'kanban'
                  ? 'bg-active font-semibold text-foreground shadow-sm'
                  : 'text-tertiary hover:text-foreground'
              )}
            >
              <Columns className="h-3.5 w-3.5" />
              <span>Канбан</span>
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={cn(
                'flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors',
                viewMode === 'table'
                  ? 'bg-active font-semibold text-foreground shadow-sm'
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
            className="flex h-9 items-center gap-1.5 rounded-lg border border-subtle bg-surface px-3 text-xs font-medium text-foreground transition-colors hover:bg-hover disabled:opacity-50"
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

      {/* Aggregate KPI Strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-subtle bg-surface p-4">
          <span className="text-xs text-tertiary">Всего сделок</span>
          <p className="mt-1 text-xl font-bold text-foreground">
            {totalDealsCount}
          </p>
        </div>
        <div className="rounded-xl border border-subtle bg-surface p-4">
          <span className="text-xs text-tertiary">Общий пайплайн</span>
          <p className="mt-1 text-xl font-bold text-foreground">
            {totalPipelineAmount.toLocaleString('ru-RU')} ₽
          </p>
        </div>
        <div className="rounded-xl border border-subtle bg-surface p-4">
          <span className="text-xs text-tertiary">Риск SLA по регламенту</span>
          <p className="mt-1 text-xl font-bold text-amber-400">
            {totalSlaRisks}
          </p>
        </div>
        <div className="rounded-xl border border-subtle bg-surface p-4">
          <span className="text-xs text-tertiary">Активная воронка</span>
          <p className="mt-1 truncate text-sm font-semibold text-foreground">
            {activePipeline.name}
          </p>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-subtle bg-surface p-3">
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
          {/* SLA Risk Filter */}
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

      {/* Main View: Kanban vs Table */}
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
        /* Kanban Board */
        <div className="flex gap-4 overflow-x-auto pb-4">
          {kanbanColumns.map(({ stage, deals: colDeals, totalAmount }) => {
            const stageColor = stage.color || '#9E9E9E';

            return (
              <div
                key={stage.id}
                className="bg-surface/60 flex w-72 shrink-0 flex-col overflow-hidden rounded-xl border border-subtle shadow-sm"
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
                <div className="max-h-[680px] flex-1 space-y-2.5 overflow-y-auto p-2">
                  {colDeals.length === 0 ? (
                    <div className="border-subtle/60 rounded-lg border border-dashed p-4 text-center">
                      <span className="text-[11px] text-tertiary">
                        Нет сделок
                      </span>
                    </div>
                  ) : (
                    colDeals.map((d) => (
                      <div
                        key={d.id}
                        onClick={() => {
                          setSelectedDeal(d);
                          setDrawerOpen(true);
                        }}
                        className="shadow-xs hover:border-primary/50 group relative cursor-pointer space-y-2 rounded-lg border border-subtle bg-surface p-3.5 transition-all hover:shadow-md"
                      >
                        {/* Title & Company */}
                        <div className="space-y-0.5">
                          <span className="line-clamp-2 text-xs font-semibold text-foreground transition-colors group-hover:text-primary">
                            {d.company_name || d.title}
                          </span>
                          <span className="block font-mono text-[10px] text-tertiary">
                            {d.crm_deal_id || d.id}
                          </span>
                        </div>

                        {/* Amount */}
                        <div className="font-mono text-sm font-bold text-foreground">
                          {d.amount_str ||
                            `${d.amount?.toLocaleString('ru-RU')} ₽`}
                        </div>

                        {/* Badges / Indicators */}
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          {/* SLA Risk Alert Badge */}
                          {d.sla_risk && (
                            <Badge
                              variant="outline"
                              className="border-amber-500/30 bg-amber-500/10 px-1.5 py-0 text-[10px] font-semibold text-amber-300"
                            >
                              <AlertTriangle className="mr-1 h-3 w-3 text-amber-400" />
                              Риск SLA
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
                              </Badge>
                            )}
                        </div>

                        {/* Responsible Manager */}
                        <div className="border-subtle/50 flex items-center justify-between border-t pt-1 text-[11px] text-tertiary">
                          <span className="max-w-[140px] truncate">
                            {d.responsible_user || 'Не назначен'}
                          </span>
                          <span className="font-mono text-[10px]">
                            {d.created_at ? d.created_at.substring(0, 10) : ''}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Table View */
        <div className="overflow-hidden rounded-xl border border-subtle bg-surface shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-subtle/40 border-b border-subtle text-[10px] font-semibold uppercase tracking-wider text-tertiary">
                <tr>
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">Сделка / Клиент</th>
                  <th className="px-4 py-3">Воронка</th>
                  <th className="px-4 py-3">Этап</th>
                  <th className="px-4 py-3 text-right">Сумма</th>
                  <th className="px-4 py-3">Менеджер</th>
                  <th className="px-4 py-3 text-center">Звонки</th>
                  <th className="px-4 py-3">Статус / Причина</th>
                  <th className="px-4 py-3">Дата</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-subtle">
                {filteredDeals.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-tertiary">
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
                      className="group cursor-pointer transition-colors hover:bg-hover"
                    >
                      <td className="px-4 py-3 font-mono text-tertiary group-hover:text-foreground">
                        {d.crm_deal_id || d.id}
                      </td>
                      <td className="px-4 py-3">
                        <span className="block font-semibold text-foreground transition-colors group-hover:text-primary">
                          {d.company_name || d.title}
                        </span>
                        {d.sla_risk && (
                          <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-semibold text-amber-400">
                            <AlertTriangle className="h-3 w-3" /> Риск SLA
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-secondary">
                        {d.pipeline_name || 'Основная воронка'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-foreground">
                          {d.stage_name || d.stage}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-foreground">
                        {d.amount_str ||
                          `${d.amount?.toLocaleString('ru-RU')} ₽`}
                      </td>
                      <td className="max-w-[140px] truncate px-4 py-3 text-secondary">
                        {d.responsible_user || 'Не назначен'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {typeof d.calls_count === 'number' &&
                        d.calls_count > 0 ? (
                          <Badge
                            variant="outline"
                            className="font-mono text-[10px]"
                          >
                            {d.calls_count}
                          </Badge>
                        ) : (
                          <span className="text-tertiary">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {d.loss_reason ? (
                          <Badge
                            variant="outline"
                            className="max-w-[160px] truncate border-rose-500/30 bg-rose-500/10 text-[10px] text-rose-300"
                          >
                            {d.loss_reason}
                          </Badge>
                        ) : d.status === 'won' ? (
                          <Badge
                            variant="outline"
                            className="border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-400"
                          >
                            Оплачена
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">
                            В работе
                          </Badge>
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

      {/* Deal Details Slide-Over Drawer */}
      <DealDetailsDrawer
        deal={selectedDeal}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        tenantId={activeTenantId}
      />
    </div>
  );
}

export default DealsPage;

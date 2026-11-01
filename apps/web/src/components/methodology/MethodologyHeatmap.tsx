/**
 * apps/web/src/components/methodology/MethodologyHeatmap.tsx
 *
 * 13-Criteria Methodology Impact Heatmap & Version Comparison (A/B Delta):
 * - Displays net delta (Lift) vs baseline
 * - Mini-progress bar for discipline (Adherence Rate AR)
 * - Dotted border + ⚠️ warning when Adherence < 40% (Sabotage indicator)
 * - Side-by-side Version Comparison (v1.0 vs v2.0) with delta Lift, delta Defect, and intervention verdicts
 * - One-click launch into X-Ray Drawer
 */

import * as React from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart2,
  CheckCircle2,
  GitCompare,
  Minus,
  RefreshCw,
  Skull,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { apiClient } from '@/lib/api';
import type {
  HeatmapMatrixRow,
  InterventionVerdict,
  ScriptVersionItem,
  VersionComparisonResponse,
} from '@/types/api';

export interface MethodologyHeatmapProps {
  matrix: HeatmapMatrixRow[];
  loading: boolean;
  onSelectCriterion: (criterion: string) => void;
  versions?: ScriptVersionItem[];
  currentVersionId?: string;
  tenantId?: string;
}

export function MethodologyHeatmap({
  matrix,
  loading,
  onSelectCriterion,
  versions = [],
  currentVersionId,
  tenantId,
}: MethodologyHeatmapProps) {
  const [viewMode, setViewMode] = React.useState<'matrix' | 'compare'>('matrix');
  const [filter, setFilter] = React.useState<'all' | 'sabotage' | 'working'>('all');

  // Comparison State
  const [v1Id, setV1Id] = React.useState<string>('');
  const [v2Id, setV2Id] = React.useState<string>('');
  const [compareData, setCompareData] = React.useState<VersionComparisonResponse | null>(null);
  const [loadingCompare, setLoadingCompare] = React.useState(false);
  const [compareError, setCompareError] = React.useState<string | null>(null);

  // Auto-init comparison versions when available
  React.useEffect(() => {
    if (versions.length >= 2) {
      if (!v1Id) {
        // Oldest or baseline version as v1
        const baseline = versions[versions.length - 1];
        setV1Id(baseline.id);
      }
      if (!v2Id) {
        // Active or newest version as v2
        const active = currentVersionId ? versions.find((v) => v.id === currentVersionId) || versions[0] : versions[0];
        setV2Id(active.id);
      }
    } else if (versions.length === 1 && !v1Id) {
      setV1Id(versions[0].id);
      setV2Id(versions[0].id);
    }
  }, [versions, v1Id, v2Id, currentVersionId]);

  const loadComparison = React.useCallback(async (ver1: string, ver2: string) => {
    if (!ver1 || !ver2) return;
    setLoadingCompare(true);
    setCompareError(null);
    try {
      const res = await apiClient.methodology.compareVersions(ver1, ver2, tenantId);
      setCompareData(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка загрузки сравнения версий';
      setCompareError(msg);
      console.error('Failed to load version comparison:', err);
    } finally {
      setLoadingCompare(false);
    }
  }, [tenantId]);

  // Trigger comparison when switching to compare mode
  React.useEffect(() => {
    if (viewMode === 'compare' && v1Id && v2Id) {
      loadComparison(v1Id, v2Id);
    }
  }, [viewMode, v1Id, v2Id, loadComparison]);

  const filteredMatrix = React.useMemo(() => {
    if (filter === 'sabotage') {
      return matrix.filter((r) => r.is_sabotage);
    }
    if (filter === 'working') {
      return matrix.filter((r) => r.verdict_status === 'WORKING_STANDARD');
    }
    return matrix;
  }, [matrix, filter]);

  // Aggregate stats
  const totalCalls = matrix.length > 0 ? Math.max(...matrix.map((r) => r.total_relevant_calls)) : 0;
  const avgDiscipline =
    matrix.length > 0
      ? Math.round(matrix.reduce((acc, r) => acc + r.ar_pct, 0) / matrix.length)
      : 0;
  const sabotageCount = matrix.filter((r) => r.is_sabotage).length;
  const workingCount = matrix.filter((r) => r.verdict_status === 'WORKING_STANDARD').length;

  const renderVerdictBadge = (verdict: InterventionVerdict) => {
    switch (verdict) {
      case 'IMPROVEMENT_CONFIRMED':
        return (
          <Badge className="bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/40 text-[10px] px-2 py-0.5 gap-1 shrink-0 font-medium">
            <CheckCircle2 className="h-3 w-3" />
            Улучшение
          </Badge>
        );
      case 'SABOTAGE_NEW_VERSION':
        return (
          <Badge className="bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/40 text-[10px] px-2 py-0.5 gap-1 shrink-0 font-medium">
            <AlertTriangle className="h-3 w-3" />
            Саботаж
          </Badge>
        );
      case 'HYPOTHESIS_FAILED':
        return (
          <Badge className="bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-500/40 text-[10px] px-2 py-0.5 gap-1 shrink-0 font-medium">
            <Skull className="h-3 w-3" />
            Провал
          </Badge>
        );
      case 'STABLE_NEUTRAL':
      default:
        return (
          <Badge variant="outline" className="border-subtle text-secondary text-[10px] px-2 py-0.5 shrink-0">
            Без изменений
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-4" data-testid="methodology-heatmap">
      {/* Top View Toggle Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-surface p-2.5 rounded-xl border border-subtle">
        <div className="flex items-center gap-2">
          <Button
            variant={viewMode === 'matrix' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('matrix')}
            className="h-8 text-xs font-semibold gap-1.5"
            data-testid="view-matrix-btn"
          >
            <BarChart2 className="h-3.5 w-3.5" />
            Текущая матрица (13 критериев)
          </Button>

          <Button
            variant={viewMode === 'compare' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('compare')}
            className="h-8 text-xs font-semibold gap-1.5 text-primary"
            data-testid="view-compare-btn"
          >
            <GitCompare className="h-3.5 w-3.5" />
            Сравнить версии (A/B Дельта)
          </Button>
        </div>

        {viewMode === 'compare' && versions.length > 0 && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-tertiary">Сравнить:</span>
            <select
              value={v1Id}
              onChange={(e) => setV1Id(e.target.value)}
              className="h-8 rounded-md border border-subtle bg-background px-2 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.version_tag} ({v.title.slice(0, 20)})
                </option>
              ))}
            </select>
            <ArrowRight className="h-3.5 w-3.5 text-tertiary" />
            <select
              value={v2Id}
              onChange={(e) => setV2Id(e.target.value)}
              className="h-8 rounded-md border border-subtle bg-background px-2 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.version_tag} {v.is_active ? '★ (Активна)' : ''}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadComparison(v1Id, v2Id)}
              disabled={loadingCompare}
              className="h-8 px-2 text-xs"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', loadingCompare && 'animate-spin')} />
            </Button>
          </div>
        )}
      </div>

      {/* MATRIX VIEW */}
      {viewMode === 'matrix' && (
        <>
          {/* Summary KPI Strip */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card className="p-3.5 bg-surface border-subtle">
              <div className="text-xs text-secondary font-medium">Релевантных звонков</div>
              <div className="text-xl font-bold text-foreground mt-0.5">{totalCalls}</div>
              <div className="text-[11px] text-tertiary">Оценено по 13 критериям</div>
            </Card>

            <Card className="p-3.5 bg-surface border-subtle">
              <div className="text-xs text-secondary font-medium">Средняя дисциплина (AR)</div>
              <div className="text-xl font-bold text-foreground mt-0.5">{avgDiscipline}%</div>
              <div className="text-[11px] text-tertiary">По смысловым якорям</div>
            </Card>

            <Card className="p-3.5 bg-surface border-subtle">
              <div className="text-xs text-secondary font-medium">Саботаж (Скрытые алмазы)</div>
              <div className="text-xl font-bold text-amber-500 mt-0.5 flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4" />
                {sabotageCount}
              </div>
              <div className="text-[11px] text-tertiary">Скрипт пушка, но не говорят</div>
            </Card>

            <Card className="p-3.5 bg-surface border-subtle">
              <div className="text-xs text-secondary font-medium">Рабочих стандартов</div>
              <div className="text-xl font-bold text-emerald-500 mt-0.5 flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4" />
                {workingCount}
              </div>
              <div className="text-[11px] text-tertiary">Стабильный рост конверсии</div>
            </Card>
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center justify-between border-b border-subtle pb-3">
            <div className="flex items-center gap-1.5">
              <Button
                variant={filter === 'all' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setFilter('all')}
                className="h-8 text-xs font-medium"
              >
                Все 13 критериев ({matrix.length})
              </Button>
              <Button
                variant={filter === 'sabotage' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setFilter('sabotage')}
                className="h-8 text-xs font-medium gap-1 text-amber-600 dark:text-amber-400"
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                Только Саботаж ({sabotageCount})
              </Button>
              <Button
                variant={filter === 'working' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setFilter('working')}
                className="h-8 text-xs font-medium gap-1 text-emerald-600 dark:text-emerald-400"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Рабочий стандарт ({workingCount})
              </Button>
            </div>
          </div>

          {/* Heatmap Grid */}
          {loading ? (
            <div className="space-y-3">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {filteredMatrix.map((item) => {
                const isSabotage = item.is_sabotage;
                const liftPositive = item.script_lift_pct > 0;
                const liftNegative = item.script_lift_pct < 0;

                return (
                  <div
                    key={item.criterion}
                    onClick={() => onSelectCriterion(item.criterion)}
                    data-testid={`heatmap-cell-${item.criterion}`}
                    className={cn(
                      'group relative flex flex-col justify-between rounded-xl p-4 transition-all duration-150 cursor-pointer',
                      'bg-surface hover:bg-hover border',
                      isSabotage
                        ? 'border-dashed border-amber-500/80 bg-amber-500/5 hover:border-amber-500 shadow-sm'
                        : item.verdict_status === 'WORKING_STANDARD'
                        ? 'border-emerald-500/40 bg-emerald-500/5'
                        : item.verdict_status === 'HYPOTHESIS_FAILED'
                        ? 'border-rose-500/40 bg-rose-500/5'
                        : item.verdict_status === 'FREESTYLE_STRONGER'
                        ? 'border-blue-500/40 bg-blue-500/5'
                        : 'border-subtle'
                    )}
                  >
                    {/* Cell Header */}
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs font-bold uppercase text-primary">
                            {item.criterion.toUpperCase()}
                          </span>
                          <span className="text-[11px] text-tertiary">• {item.stage}</span>
                        </div>
                        <div className="text-sm font-semibold text-foreground mt-0.5 line-clamp-1">
                          {item.title}
                        </div>
                      </div>

                      {/* Verdict Badge */}
                      {isSabotage ? (
                        <Badge className="bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/40 text-[10px] px-2 py-0.5 gap-1 shrink-0">
                          <AlertTriangle className="h-3 w-3" />
                          Саботаж
                        </Badge>
                      ) : item.verdict_status === 'WORKING_STANDARD' ? (
                        <Badge className="bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/40 text-[10px] px-2 py-0.5 gap-1 shrink-0">
                          <CheckCircle2 className="h-3 w-3" />
                          Стандарт
                        </Badge>
                      ) : item.verdict_status === 'HYPOTHESIS_FAILED' ? (
                        <Badge className="bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-500/40 text-[10px] px-2 py-0.5 gap-1 shrink-0">
                          <Skull className="h-3 w-3" />
                          Провал
                        </Badge>
                      ) : item.verdict_status === 'FREESTYLE_STRONGER' ? (
                        <Badge className="bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/40 text-[10px] px-2 py-0.5 gap-1 shrink-0">
                          <Sparkles className="h-3 w-3" />
                          Отсебятина
                        </Badge>
                      ) : null}
                    </div>

                    {/* Central Lift & Stats */}
                    <div className="my-3 flex items-baseline justify-between">
                      <div className="flex items-center gap-1.5">
                        {liftPositive ? (
                          <ArrowUpRight className="h-5 w-5 text-emerald-500" />
                        ) : liftNegative ? (
                          <ArrowDownRight className="h-5 w-5 text-rose-500" />
                        ) : (
                          <Minus className="h-4 w-4 text-tertiary" />
                        )}
                        <span
                          className={cn(
                            'text-2xl font-black font-mono',
                            liftPositive
                              ? 'text-emerald-500'
                              : liftNegative
                              ? 'text-rose-500'
                              : 'text-tertiary'
                          )}
                        >
                          {liftPositive ? `+${item.script_lift_pct}%` : `${item.script_lift_pct}%`}
                        </span>
                        <span className="text-xs text-tertiary font-medium">буст текста</span>
                      </div>

                      <div className="text-right text-xs">
                        <span className="text-secondary font-medium">Конверсия этапа: </span>
                        <span className="font-bold font-mono text-foreground">{item.total_win_pct}%</span>
                      </div>
                    </div>

                    {/* Mini Discipline Bar */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-tertiary">
                          Дисциплина (AR): <strong className="text-foreground">{item.ar_pct}%</strong>
                        </span>
                        <span className="text-tertiary font-mono">
                          {item.script_calls}/{item.total_relevant_calls} зв.
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-hover overflow-hidden">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all duration-300',
                            item.ar_pct >= 65
                              ? 'bg-emerald-500'
                              : item.ar_pct >= 40
                              ? 'bg-amber-500'
                              : 'bg-rose-500'
                          )}
                          style={{ width: `${Math.min(100, item.ar_pct)}%` }}
                        />
                      </div>
                    </div>

                    {/* Warning note if sabotage */}
                    {isSabotage && (
                      <div className="mt-2 text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1 font-medium">
                        ⚠️ По скрипту {item.swr_pct}%, но говорят только в {item.ar_pct}% звонков!
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* VERSION COMPARISON VIEW (A/B DELTA) */}
      {viewMode === 'compare' && (
        <div className="space-y-4" data-testid="version-comparison-container">
          {compareError && (
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-xs text-rose-500 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{compareError}</span>
            </div>
          )}

          {loadingCompare ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-64 w-full rounded-xl" />
            </div>
          ) : compareData ? (
            <>
              {/* Executive Summary Card */}
              <Card className="p-4 bg-surface border-subtle space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xs font-bold uppercase tracking-wider text-secondary">
                      Итоговый вердикт внедрения:
                    </span>
                    {renderVerdictBadge(compareData.summary.overall_status as InterventionVerdict)}
                  </div>

                  <div className="flex items-center gap-4 text-xs">
                    <div className="flex items-center gap-1.5">
                      <TrendingUp className="h-4 w-4 text-emerald-500" />
                      <span className="text-secondary">Улучшилось критериев:</span>
                      <strong className="text-emerald-500 font-mono">
                        {compareData.summary.improved_criteria_count}
                      </strong>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <TrendingDown className="h-4 w-4 text-rose-500" />
                      <span className="text-secondary">Ухудшилось:</span>
                      <strong className="text-rose-500 font-mono">
                        {compareData.summary.degraded_criteria_count}
                      </strong>
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-surface/80 border border-subtle text-xs text-foreground leading-relaxed flex items-start gap-2">
                  <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">Анализ РОПа: </span>
                    {compareData.summary.summary_verdict}
                  </div>
                </div>
              </Card>

              {/* Side-by-Side Comparison Table */}
              <div className="rounded-xl border border-subtle bg-surface overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-hover/60 border-b border-subtle text-secondary font-semibold">
                      <tr>
                        <th className="py-3 px-4">Критерий / Этап</th>
                        <th className="py-3 px-3">
                          {compareData.v1.version_tag} (База)
                          <div className="text-[10px] text-tertiary font-normal">AR / SWR / Lift</div>
                        </th>
                        <th className="py-3 px-3">
                          {compareData.v2.version_tag} (Новая)
                          <div className="text-[10px] text-tertiary font-normal">AR / SWR / Lift</div>
                        </th>
                        <th className="py-3 px-3 text-center">Δ Lift (Буст)</th>
                        <th className="py-3 px-3 text-center">Δ Брака</th>
                        <th className="py-3 px-4 text-right">Решение ИИ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-subtle/40">
                      {compareData.comparison.map((row) => {
                        const deltaPositive = row.delta_lift_pct > 0;
                        const deltaNegative = row.delta_lift_pct < 0;
                        const defectImproved = row.delta_defect_rate_pct < 0;

                        return (
                          <tr
                            key={row.criterion}
                            onClick={() => onSelectCriterion(row.criterion)}
                            className="hover:bg-hover cursor-pointer transition-colors"
                          >
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono font-bold text-primary uppercase">
                                  {row.criterion}
                                </span>
                                <span className="text-tertiary">• {row.stage}</span>
                              </div>
                              <div className="text-foreground font-medium mt-0.5 line-clamp-1">
                                {row.title}
                              </div>
                            </td>

                            <td className="py-3 px-3 font-mono">
                              <div>
                                AR: <strong>{row.v1_metrics.ar_pct}%</strong>
                              </div>
                              <div className="text-secondary text-[11px]">
                                SWR: {row.v1_metrics.swr_pct}% | Lift: {row.v1_metrics.lift_pct > 0 ? `+${row.v1_metrics.lift_pct}` : row.v1_metrics.lift_pct}%
                              </div>
                            </td>

                            <td className="py-3 px-3 font-mono">
                              <div>
                                AR: <strong className={cn(row.v2_metrics.ar_pct >= row.v1_metrics.ar_pct ? 'text-emerald-500' : 'text-amber-500')}>{row.v2_metrics.ar_pct}%</strong>
                              </div>
                              <div className="text-secondary text-[11px]">
                                SWR: {row.v2_metrics.swr_pct}% | Lift: {row.v2_metrics.lift_pct > 0 ? `+${row.v2_metrics.lift_pct}` : row.v2_metrics.lift_pct}%
                              </div>
                            </td>

                            <td className="py-3 px-3 text-center font-mono font-bold">
                              <span
                                className={cn(
                                  deltaPositive
                                    ? 'text-emerald-500'
                                    : deltaNegative
                                    ? 'text-rose-500'
                                    : 'text-tertiary'
                                )}
                              >
                                {deltaPositive ? `+${row.delta_lift_pct}%` : `${row.delta_lift_pct}%`}
                              </span>
                            </td>

                            <td className="py-3 px-3 text-center font-mono">
                              <span
                                className={cn(
                                  defectImproved
                                    ? 'text-emerald-500'
                                    : row.delta_defect_rate_pct > 0
                                    ? 'text-rose-500'
                                    : 'text-tertiary'
                                )}
                              >
                                {row.delta_defect_rate_pct > 0
                                  ? `+${row.delta_defect_rate_pct}%`
                                  : `${row.delta_defect_rate_pct}%`}
                              </span>
                            </td>

                            <td className="py-3 px-4 text-right">
                              {renderVerdictBadge(row.intervention_verdict)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <Card className="p-8 text-center text-xs text-secondary bg-surface border-subtle">
              Выберите версии для сравнения и нажмите «Сравнить».
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

export default MethodologyHeatmap;

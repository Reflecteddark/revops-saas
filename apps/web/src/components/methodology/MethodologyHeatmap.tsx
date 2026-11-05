/**
 * apps/web/src/components/methodology/MethodologyHeatmap.tsx
 *
 * The 13 audit criteria against the speech standard, and the comparison of two versions.
 * - "Говорят по скрипту" (AR): in how many calls the manager said what the standard asks
 * - "Критерий пройден" with the standard and without it (SWR / FWR), and the difference between them
 * A verdict appears only with enough calls; until then the card shows how many are still needed.
 */

import * as React from 'react';
import { AlertTriangle, ArrowRight, BarChart2, CheckCircle2, GitCompare, RefreshCw, Sparkles, TrendingDown, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { apiClient } from '@/lib/api';
import type { HeatmapMatrixRow, InterventionVerdict, ScriptVersionItem, VersionComparisonResponse } from '@/types/api';
import { COMPARISON_BADGE, COMPARISON_LABEL, VERDICT_BADGE, VERDICT_SHORT, VERDICT_TONE, errorText } from './shared';

const MIN_CALLS = 30;

export interface MethodologyHeatmapProps {
  matrix: HeatmapMatrixRow[];
  loading: boolean;
  onSelectCriterion: (criterion: string) => void;
  versions?: ScriptVersionItem[];
  currentVersionId?: string;
  tenantId?: string;
}

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

function renderIntervention(verdict: InterventionVerdict) {
  const map: Record<InterventionVerdict, { text: string; cls: string }> = {
    IMPROVEMENT_CONFIRMED: { text: 'Улучшение', cls: 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/40' },
    SABOTAGE_NEW_VERSION: { text: 'Говорят редко', cls: 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/40' },
    HYPOTHESIS_FAILED: { text: 'Не сработало', cls: 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-500/40' },
    STABLE_NEUTRAL: { text: 'Без изменений', cls: 'bg-hover text-secondary border-subtle' },
    COLLECTING_DATA: { text: 'Мало данных', cls: 'bg-hover text-tertiary border-subtle' },
  };
  const { text, cls } = map[verdict] ?? map.STABLE_NEUTRAL;
  return <Badge className={cn('text-[10px] px-2 py-0.5 shrink-0 font-medium', cls)}>{text}</Badge>;
}

export function MethodologyHeatmap({ matrix, loading, onSelectCriterion, versions = [], currentVersionId, tenantId }: MethodologyHeatmapProps) {
  const [viewMode, setViewMode] = React.useState<'matrix' | 'compare'>('matrix');
  const [filter, setFilter] = React.useState<'all' | 'sabotage' | 'working'>('all');

  const [v1Id, setV1Id] = React.useState<string>('');
  const [v2Id, setV2Id] = React.useState<string>('');
  const [compareData, setCompareData] = React.useState<VersionComparisonResponse | null>(null);
  const [loadingCompare, setLoadingCompare] = React.useState(false);
  const [compareError, setCompareError] = React.useState<string | null>(null);

  // The versions list is ordered newest first: the oldest is the base, the one on screen is the new one.
  React.useEffect(() => {
    if (versions.length >= 2) {
      setV1Id((prev) => (prev && versions.some((v) => v.id === prev) ? prev : versions[versions.length - 1].id));
      setV2Id((prev) => (prev && versions.some((v) => v.id === prev) ? prev : (versions.find((v) => v.id === currentVersionId) || versions[0]).id));
    } else if (versions.length === 1) {
      setV1Id(versions[0].id);
      setV2Id(versions[0].id);
    }
  }, [versions, currentVersionId]);

  const loadComparison = React.useCallback(
    async (ver1: string, ver2: string) => {
      if (!ver1 || !ver2) return;
      setLoadingCompare(true);
      setCompareError(null);
      try {
        setCompareData(await apiClient.methodology.compareVersions(ver1, ver2, tenantId));
      } catch (err) {
        setCompareError(errorText(err, 'Не удалось загрузить сравнение версий'));
      } finally {
        setLoadingCompare(false);
      }
    },
    [tenantId]
  );

  React.useEffect(() => {
    if (viewMode === 'compare' && v1Id && v2Id) void loadComparison(v1Id, v2Id);
  }, [viewMode, v1Id, v2Id, loadComparison]);

  const scripted = matrix.filter((r) => r.has_standard);
  const withData = scripted.filter((r) => r.total_relevant_calls > 0);
  const enough = scripted.filter((r) => r.enough_data);
  const maxCalls = scripted.length ? Math.max(...scripted.map((r) => r.total_relevant_calls)) : 0;
  const avgAdherence = withData.length ? Math.round(withData.reduce((s, r) => s + r.ar_pct, 0) / withData.length) : null;
  const gemCount = matrix.filter((r) => r.is_sabotage).length;
  const workingCount = matrix.filter((r) => r.verdict_status === 'WORKING_STANDARD').length;

  const filteredMatrix = React.useMemo(() => {
    if (filter === 'sabotage') return matrix.filter((r) => r.is_sabotage);
    if (filter === 'working') return matrix.filter((r) => r.verdict_status === 'WORKING_STANDARD');
    return matrix;
  }, [matrix, filter]);

  return (
    <div className="space-y-4" data-testid="methodology-heatmap">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-surface p-2.5 rounded-xl border border-subtle">
        <div className="flex items-center gap-2">
          <Button variant={viewMode === 'matrix' ? 'default' : 'ghost'} size="sm" onClick={() => setViewMode('matrix')} className="h-8 text-xs font-semibold gap-1.5" data-testid="view-matrix-btn">
            <BarChart2 className="h-3.5 w-3.5" />
            Текущая версия (13 критериев)
          </Button>
          <Button variant={viewMode === 'compare' ? 'default' : 'ghost'} size="sm" onClick={() => setViewMode('compare')} className="h-8 text-xs font-semibold gap-1.5 text-primary" data-testid="view-compare-btn">
            <GitCompare className="h-3.5 w-3.5" />
            Сравнить версии
          </Button>
        </div>

        {viewMode === 'compare' && versions.length > 0 && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-tertiary">Сравнить:</span>
            <select value={v1Id} onChange={(e) => setV1Id(e.target.value)} className="h-8 rounded-md border border-subtle bg-background px-2 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary" aria-label="Базовая версия">
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.version_tag} ({v.title.slice(0, 20)})
                </option>
              ))}
            </select>
            <ArrowRight className="h-3.5 w-3.5 text-tertiary" />
            <select value={v2Id} onChange={(e) => setV2Id(e.target.value)} className="h-8 rounded-md border border-subtle bg-background px-2 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary" aria-label="Новая версия">
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.version_tag} {v.is_active ? '★ (боевая)' : ''}
                </option>
              ))}
            </select>
            <Button variant="outline" size="sm" onClick={() => loadComparison(v1Id, v2Id)} disabled={loadingCompare} className="h-8 px-2 text-xs" aria-label="Обновить сравнение">
              <RefreshCw className={cn('h-3.5 w-3.5', loadingCompare && 'animate-spin')} />
            </Button>
          </div>
        )}
      </div>

      {viewMode === 'matrix' && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card className="p-3.5 bg-surface border-subtle">
              <div className="text-xs text-secondary font-medium">Больше всего звонков по критерию</div>
              <div className="text-xl font-bold text-foreground mt-0.5">{maxCalls}</div>
              <div className="text-[11px] text-tertiary">Вердикт — от {MIN_CALLS}</div>
            </Card>
            <Card className="p-3.5 bg-surface border-subtle">
              <div className="text-xs text-secondary font-medium">Говорят по скрипту</div>
              <div className="text-xl font-bold text-foreground mt-0.5">{avgAdherence === null ? '—' : `${avgAdherence}%`}</div>
              <div className="text-[11px] text-tertiary">В среднем по критериям с данными</div>
            </Card>
            <Card className="p-3.5 bg-surface border-subtle">
              <div className="text-xs text-secondary font-medium">Скрытые алмазы</div>
              <div className="text-xl font-bold text-amber-500 mt-0.5 flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4" />
                {gemCount}
              </div>
              <div className="text-[11px] text-tertiary">Скрипт сильнее, но говорят не всегда</div>
            </Card>
            <Card className="p-3.5 bg-surface border-subtle">
              <div className="text-xs text-secondary font-medium">Рабочих стандартов</div>
              <div className="text-xl font-bold text-emerald-500 mt-0.5 flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4" />
                {workingCount}
              </div>
              <div className="text-[11px] text-tertiary">Из них вердикт есть у {enough.length} критериев</div>
            </Card>
          </div>

          {!loading && maxCalls === 0 && (
            <Card className="p-4 bg-surface border-subtle text-xs text-secondary" data-testid="methodology-empty-state">
              <strong className="text-foreground">Оценок по скрипту пока нет.</strong>{' '}
              Они появятся, когда звонки вашей компании будут разобраны аудитом и в расшифровке будут подписаны реплики «Менеджер:» и «Клиент:». Ниже — нули не как результат, а как отсутствие данных.
            </Card>
          )}

          <div className="flex items-center justify-between border-b border-subtle pb-3">
            <div className="flex items-center gap-1.5">
              <Button variant={filter === 'all' ? 'default' : 'ghost'} size="sm" onClick={() => setFilter('all')} className="h-8 text-xs font-medium">
                Все критерии ({matrix.length})
              </Button>
              <Button variant={filter === 'sabotage' ? 'default' : 'ghost'} size="sm" onClick={() => setFilter('sabotage')} className="h-8 text-xs font-medium gap-1 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5" />
                Скрытые алмазы ({gemCount})
              </Button>
              <Button variant={filter === 'working' ? 'default' : 'ghost'} size="sm" onClick={() => setFilter('working')} className="h-8 text-xs font-medium gap-1 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Рабочие стандарты ({workingCount})
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {filteredMatrix.map((item) => {
                const noData = item.total_relevant_calls === 0;
                const bothCohorts = item.script_calls > 0 && item.freestyle_calls > 0;
                return (
                  <div
                    key={item.criterion}
                    onClick={() => onSelectCriterion(item.criterion)}
                    data-testid={`heatmap-cell-${item.criterion}`}
                    className={cn('group relative flex flex-col gap-3 rounded-xl p-4 transition-all duration-150 cursor-pointer bg-surface hover:bg-hover border', VERDICT_TONE[item.verdict_status])}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs font-bold uppercase text-primary">{item.criterion.toUpperCase()}</span>
                          <span className="text-[11px] text-tertiary truncate">• {item.stage}</span>
                        </div>
                        <div className="text-sm font-semibold text-foreground mt-0.5 line-clamp-1">{item.title}</div>
                      </div>
                      <Badge className={cn('text-[10px] px-2 py-0.5 shrink-0', VERDICT_BADGE[item.verdict_status])}>
                        {item.verdict_status === 'COLLECTING_DATA' && noData ? 'Нет данных' : VERDICT_SHORT[item.verdict_status]}
                      </Badge>
                    </div>

                    {!item.has_standard ? (
                      <p className="text-[11px] text-tertiary leading-relaxed">Этот критерий считает код по доле слов клиента, речевого стандарта у него нет.</p>
                    ) : noData ? (
                      <p className="text-[11px] text-tertiary">Звонков по этому критерию ещё не было.</p>
                    ) : (
                      <>
                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px]">
                            <span className="text-tertiary">
                              Говорят по скрипту: <strong className="text-foreground">{item.ar_pct}%</strong>
                            </span>
                            <span className="text-tertiary font-mono">
                              {item.script_calls}/{item.total_relevant_calls} зв.
                            </span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-hover overflow-hidden">
                            <div className={cn('h-full rounded-full transition-all duration-300', item.ar_pct >= 65 ? 'bg-emerald-500' : item.ar_pct >= 40 ? 'bg-amber-500' : 'bg-rose-500')} style={{ width: `${Math.min(100, item.ar_pct)}%` }} />
                          </div>
                        </div>

                        <div className="text-[11px] text-secondary leading-relaxed">
                          Критерий пройден: {bothCohorts ? (
                            <>
                              по скрипту <strong className="text-foreground">{item.swr_pct}%</strong>, своими словами <strong className="text-foreground">{item.fwr_pct}%</strong>
                              {item.enough_data && (
                                <span className={cn('ml-1 font-mono font-bold', item.script_lift_pct > 0 ? 'text-emerald-500' : item.script_lift_pct < 0 ? 'text-rose-500' : 'text-tertiary')}>
                                  ({signed(item.script_lift_pct)} п.п.)
                                </span>
                              )}
                            </>
                          ) : (
                            <>
                              всего <strong className="text-foreground">{item.total_win_pct}%</strong> (нет второй группы для сравнения)
                            </>
                          )}
                        </div>

                        {!item.enough_data && (
                          <div className="space-y-1" data-testid={`progress-${item.criterion}`}>
                            <div className="text-[11px] text-tertiary">
                              Набрано {item.total_relevant_calls} из {MIN_CALLS} звонков для вердикта
                              {item.total_relevant_calls >= MIN_CALLS && ' — не хватает звонков в одной из групп'}
                            </div>
                            <div className="h-1 w-full rounded-full bg-hover overflow-hidden">
                              <div className="h-full rounded-full bg-primary/50" style={{ width: `${Math.min(100, (item.total_relevant_calls / MIN_CALLS) * 100)}%` }} />
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {viewMode === 'compare' && (
        <div className="space-y-4" data-testid="version-comparison-container">
          {compareError && (
            <div role="alert" className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-xs text-rose-500 flex items-center gap-2">
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
              <Card className="p-4 bg-surface border-subtle space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xs font-bold uppercase tracking-wider text-secondary">Итоговый вердикт внедрения:</span>
                    <Badge className={cn('text-[10px] px-2 py-0.5 shrink-0 font-medium', COMPARISON_BADGE[compareData.summary.overall_status] ?? COMPARISON_BADGE.NEUTRAL)}>
                      {COMPARISON_LABEL[compareData.summary.overall_status] ?? compareData.summary.overall_status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <div className="flex items-center gap-1.5">
                      <TrendingUp className="h-4 w-4 text-emerald-500" />
                      <span className="text-secondary">Улучшилось:</span>
                      <strong className="text-emerald-500 font-mono">{compareData.summary.improved_criteria_count}</strong>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <TrendingDown className="h-4 w-4 text-rose-500" />
                      <span className="text-secondary">Ухудшилось:</span>
                      <strong className="text-rose-500 font-mono">{compareData.summary.degraded_criteria_count}</strong>
                    </div>
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-surface/80 border border-subtle text-xs text-foreground leading-relaxed flex items-start gap-2">
                  <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <div>
                    {compareData.summary.summary_verdict}
                    {compareData.summary.note && <div className="text-tertiary mt-1">{compareData.summary.note}</div>}
                  </div>
                </div>
              </Card>

              <div className="rounded-xl border border-subtle bg-surface overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-hover/60 border-b border-subtle text-secondary font-semibold">
                      <tr>
                        <th className="py-3 px-4">Критерий</th>
                        <th className="py-3 px-3">
                          {compareData.v1.version_tag} (база)
                          <div className="text-[10px] text-tertiary font-normal">звонков · говорят · по скрипту</div>
                        </th>
                        <th className="py-3 px-3">
                          {compareData.v2.version_tag} (новая)
                          <div className="text-[10px] text-tertiary font-normal">звонков · говорят · по скрипту</div>
                        </th>
                        <th className="py-3 px-3 text-center">Δ разницы, п.п.</th>
                        <th className="py-3 px-3 text-center">Δ непрохождения, п.п.</th>
                        <th className="py-3 px-4 text-right">Итог</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-subtle/40">
                      {compareData.comparison.map((row) => {
                        const none = row.intervention_verdict === 'COLLECTING_DATA';
                        return (
                          <tr key={row.criterion} onClick={() => onSelectCriterion(row.criterion)} className="hover:bg-hover cursor-pointer transition-colors">
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono font-bold text-primary uppercase">{row.criterion}</span>
                                <span className="text-tertiary">• {row.stage}</span>
                              </div>
                              <div className="text-foreground font-medium mt-0.5 line-clamp-1">{row.title}</div>
                            </td>
                            <td className="py-3 px-3 font-mono">
                              {row.v1_metrics.total_calls} · {row.v1_metrics.total_calls ? `${row.v1_metrics.ar_pct}%` : '—'} · {row.v1_metrics.script_calls ? `${row.v1_metrics.swr_pct}%` : '—'}
                            </td>
                            <td className="py-3 px-3 font-mono">
                              {row.v2_metrics.total_calls} · {row.v2_metrics.total_calls ? `${row.v2_metrics.ar_pct}%` : '—'} · {row.v2_metrics.script_calls ? `${row.v2_metrics.swr_pct}%` : '—'}
                            </td>
                            <td className="py-3 px-3 text-center font-mono font-bold">
                              {none ? <span className="text-tertiary">—</span> : <span className={row.delta_lift_pct > 0 ? 'text-emerald-500' : row.delta_lift_pct < 0 ? 'text-rose-500' : 'text-tertiary'}>{signed(row.delta_lift_pct)}</span>}
                            </td>
                            <td className="py-3 px-3 text-center font-mono">
                              {none ? <span className="text-tertiary">—</span> : <span className={row.delta_defect_rate_pct < 0 ? 'text-emerald-500' : row.delta_defect_rate_pct > 0 ? 'text-rose-500' : 'text-tertiary'}>{signed(row.delta_defect_rate_pct)}</span>}
                            </td>
                            <td className="py-3 px-4 text-right">{renderIntervention(row.intervention_verdict)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <Card className="p-8 text-center text-xs text-secondary bg-surface border-subtle">Выберите две версии для сравнения.</Card>
          )}
        </div>
      )}
    </div>
  );
}

export default MethodologyHeatmap;

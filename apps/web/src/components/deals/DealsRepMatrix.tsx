/**
 * apps/web/src/components/deals/DealsRepMatrix.tsx
 *
 * Rep Sales Performance Matrix & Leader DNA Speech Intelligence.
 * Mathematical SSOT:
 * - AOV: sum(won_budget) / count(won)
 * - Win Rate: won / (won + lost) * 100%
 * - Cycle Median: P50 of actual days to close
 * - Speech AI Correlation: cr1..cr13 score, Next Step rate, and SLA risk
 */

import { useQuery } from '@tanstack/react-query';
import {
  Trophy,
  Sparkles,
  ArrowRight,
  AlertTriangle,
  User,
  CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { dealsApi } from '@/lib/api';
import type { RepPerformanceMetric } from '@/types/api';

interface DealsRepMatrixProps {
  tenantId?: string;
  pipelineId?: string;
  onSelectManager?: (managerName: string) => void;
}

export function DealsRepMatrix({
  tenantId,
  pipelineId,
  onSelectManager,
}: DealsRepMatrixProps) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['deals-rep-performance', tenantId, pipelineId],
    queryFn: () =>
      dealsApi.repPerformance({
        tenant_id: tenantId,
        pipeline_id: pipelineId && pipelineId !== 'all' ? pipelineId : undefined,
      }),
    staleTime: 30_000,
  });

  // "Лидер" only exists once somebody has actually won a deal
  const leader =
    data?.benchmark_leader && data.benchmark_leader.won_count > 0
      ? data.benchmark_leader
      : undefined;
  const team = data?.team_benchmarks;
  const reps = data?.reps || [];

  if (isLoading) {
    return (
      <div className="space-y-6" data-testid="rep-matrix-loading">
        <div className="rounded-2xl border border-subtle bg-surface p-6">
          <Skeleton className="h-6 w-64 mb-3" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-8 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-rose-400 mb-2" />
        <h3 className="text-sm font-semibold text-foreground">
          Не удалось загрузить аналитику менеджеров
        </h3>
        <p className="mt-1 text-xs text-secondary">
          Повторите попытку или проверьте синхронизацию сделок с CRM
        </p>
        <button
          onClick={() => refetch()}
          className="mt-4 rounded-lg bg-surface border border-subtle px-3 py-1.5 text-xs font-medium text-foreground hover:bg-hover"
        >
          Обновить
        </button>
      </div>
    );
  }

  if (reps.length === 0) {
    return (
      <div
        className="rounded-2xl border border-subtle bg-surface p-12 text-center"
        data-testid="rep-matrix-empty"
      >
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-subtle bg-subtle/50 text-tertiary">
          <User className="h-6 w-6" />
        </div>
        <h3 className="text-base font-bold text-foreground">
          Менеджеры в воронке пока не определены
        </h3>
        <p className="mt-1 text-xs text-secondary max-w-md mx-auto">
          Для расчёта ДНК лидера и тепловой матрицы требуются сделки с указанием ответственного менеджера из CRM.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="rep-performance-matrix">
      {/* 🏆 Benchmark Leader Card: Анатомия лидера ОП */}
      {leader && (
        <div className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-surface to-surface p-6 shadow-sm">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400">
                  <Trophy className="h-4 w-4" />
                </span>
                <Badge
                  variant="outline"
                  className="border-amber-500/40 bg-amber-500/20 font-bold uppercase tracking-wider text-amber-300 text-[10px]"
                >
                  Лидер продаж воронки
                </Badge>
                <span className="text-xs text-tertiary">
                  ДНК закрытия и коммерческий эталон
                </span>
              </div>

              <div>
                <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
                  <span>{leader.name}</span>
                  <span className="font-mono text-sm font-semibold text-emerald-400">
                    {leader.won_amount.toLocaleString('ru-RU')} ₽
                  </span>
                </h2>
                <p className="mt-1 text-xs text-secondary max-w-2xl leading-relaxed">
                  {leader.summary}
                </p>
              </div>

              {/* Drivers tags */}
              <div className="flex flex-wrap gap-2 pt-1">
                {leader.drivers.map((drv: string, idx: number) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-200"
                  >
                    <Sparkles className="h-3 w-3 text-amber-400" />
                    <span>{drv}</span>
                  </span>
                ))}
              </div>
            </div>

            {/* Quick Metrics Grid for Leader */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:w-[480px]">
              {/* Metric: Win Rate */}
              <div className="rounded-xl border border-subtle bg-surface/80 p-3">
                <span className="text-[10px] uppercase font-semibold text-tertiary block">
                  Win Rate
                </span>
                <span className="font-mono text-base font-bold text-emerald-400">
                  {leader.win_rate_pct}%
                </span>
                <span className="text-[10px] text-tertiary block mt-0.5">
                  {leader.win_rate_delta >= 0 ? `+${leader.win_rate_delta}%` : `${leader.win_rate_delta}%`} к отделу
                </span>
              </div>

              {/* Metric: AOV */}
              <div className="rounded-xl border border-subtle bg-surface/80 p-3">
                <span className="text-[10px] uppercase font-semibold text-tertiary block">
                  Средний чек
                </span>
                <span className="font-mono text-sm font-bold text-foreground">
                  {Math.round(leader.avg_deal_amount).toLocaleString('ru-RU')} ₽
                </span>
                <span className="text-[10px] text-tertiary block mt-0.5">
                  {leader.aov_delta_pct >= 0 ? `+${leader.aov_delta_pct}%` : `${leader.aov_delta_pct}%`} к норме
                </span>
              </div>

              {/* Metric: Cycle Days */}
              <div className="rounded-xl border border-subtle bg-surface/80 p-3">
                <span className="text-[10px] uppercase font-semibold text-tertiary block">
                  Медиана цикла
                </span>
                <span className="font-mono text-base font-bold text-foreground">
                  {leader.cycle_days_median !== null ? `${leader.cycle_days_median} дн.` : '—'}
                </span>
                <span className="text-[10px] text-tertiary block mt-0.5">
                  P50 дожим
                </span>
              </div>

              {/* Metric: Speech AI */}
              <div className="rounded-xl border border-subtle bg-surface/80 p-3">
                <span className="text-[10px] uppercase font-semibold text-tertiary block">
                  ИИ-Аудит балл
                </span>
                <span className="font-mono text-base font-bold text-indigo-400">
                  {leader.speech_score_avg !== null ? `${leader.speech_score_avg} / 13` : '—'}
                </span>
                <span className="text-[10px] text-tertiary block mt-0.5">
                  Качество речи
                </span>
              </div>
            </div>
          </div>

          {onSelectManager && (
            <div className="mt-4 pt-4 border-t border-amber-500/20 flex items-center justify-between">
              <span className="text-[11px] text-tertiary">
                Выиграно {leader.won_count} сделок в текущей воронке
              </span>
              <button
                onClick={() => onSelectManager(leader.name)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-200 transition-colors hover:bg-amber-500/20"
              >
                <span>Смотреть сделки лидера</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* 📊 Team Benchmarks Strip */}
      {team && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-subtle bg-surface p-4">
            <span className="text-xs text-tertiary">Общая касса отдела</span>
            <p className="font-mono text-lg font-bold text-foreground mt-1">
              {Math.round(team.total_won_amount).toLocaleString('ru-RU')} ₽
            </p>
            <p className="text-[11px] text-tertiary">Все успешные сделки</p>
          </div>

          <div className="rounded-xl border border-subtle bg-surface p-4">
            <span className="text-xs text-tertiary">Норма среднего чека</span>
            <p className="font-mono text-lg font-bold text-foreground mt-1">
              {Math.round(team.avg_deal_amount).toLocaleString('ru-RU')} ₽
            </p>
            <p className="text-[11px] text-tertiary">По отделу в целом</p>
          </div>

          <div className="rounded-xl border border-subtle bg-surface p-4">
            <span className="text-xs text-tertiary">Средний Win Rate</span>
            <p className="font-mono text-lg font-bold text-emerald-400 mt-1">
              {reps.some((r) => r.won_count + r.lost_count > 0) ? `${team.win_rate_pct}%` : '—'}
            </p>
            <p className="text-[11px] text-tertiary">Won / (Won + Lost)</p>
          </div>

          <div className="rounded-xl border border-subtle bg-surface p-4">
            <span className="text-xs text-tertiary">Медианный цикл отдела</span>
            <p className="font-mono text-lg font-bold text-foreground mt-1">
              {team.cycle_days_median !== null ? `${team.cycle_days_median} дн.` : '—'}
            </p>
            <p className="text-[11px] text-tertiary">P50 скорость закрытия</p>
          </div>
        </div>
      )}

      {/* 📋 Rep Performance Heatmap Table */}
      <div className="overflow-hidden rounded-2xl border border-subtle bg-surface shadow-xs">
        <div className="border-b border-subtle px-4 py-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-foreground">
              Тепловая карта эффективности и ДНК диалогов
            </h3>
            <p className="text-[11px] text-tertiary">
              Сквозная связка: выручка × средний чек × аудит 13 стандартов продаж
            </p>
          </div>
          <span className="text-xs text-tertiary font-mono">
            Менеджеров: {reps.length}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-subtle bg-subtle/30 text-[10px] font-semibold uppercase tracking-wider text-tertiary">
              <tr>
                <th className="px-4 py-3">Менеджер</th>
                <th className="px-4 py-3 text-right">Выручка (Won)</th>
                <th className="px-4 py-3 text-center">Сделки (W/L/A)</th>
                <th className="px-4 py-3 text-right">Win Rate</th>
                <th className="px-4 py-3 text-right">Ср. чек</th>
                <th className="px-4 py-3 text-right">Цикл (P50)</th>
                <th className="px-4 py-3 text-center">ИИ-Аудит</th>
                <th className="px-4 py-3 text-right">Next Step</th>
                <th className="px-4 py-3 text-right">В риске SLA</th>
                <th className="px-4 py-3">Драйвер / Уязвимость</th>
                <th className="px-4 py-3 text-center">Действие</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-subtle">
              {reps.map((rep: RepPerformanceMetric) => {
                const isRepLeader = leader && leader.name === rep.manager_name;
                const wonPctOfTeam = team && team.total_won_amount > 0
                  ? Math.round((rep.won_amount / team.total_won_amount) * 100)
                  : 0;

                // Win Rate color tier
                const wrColor =
                  rep.win_rate_pct >= 40
                    ? 'text-emerald-400 font-bold'
                    : rep.win_rate_pct >= 20
                      ? 'text-amber-400 font-semibold'
                      : 'text-rose-400 font-medium';

                // Speech score color tier (strict B2B: >=9 green, 6-8 amber, <6 red)
                const speechColor =
                  rep.speech_score_avg === null
                    ? 'text-tertiary'
                    : rep.speech_score_avg >= 9.0
                      ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
                      : rep.speech_score_avg >= 6.0
                        ? 'text-amber-400 bg-amber-500/10 border-amber-500/30'
                        : 'text-rose-400 bg-rose-500/10 border-rose-500/30';

                return (
                  <tr
                    key={rep.manager_name}
                    className={cn(
                      'hover:bg-hover/50 transition-colors',
                      isRepLeader && 'bg-amber-500/[0.03]'
                    )}
                  >
                    {/* Manager Name */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-subtle bg-surface text-secondary font-bold text-xs">
                          {rep.manager_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-semibold text-foreground flex items-center gap-1.5">
                            <span>{rep.manager_name}</span>
                            {isRepLeader && (
                              <Badge
                                variant="outline"
                                className="border-amber-500/40 bg-amber-500/20 px-1 py-0 text-[9px] font-bold text-amber-300"
                              >
                                Лидер ОП
                              </Badge>
                            )}
                          </div>
                          <span className="text-[10px] text-tertiary">
                            {rep.calls_count > 0 ? `${rep.calls_count} звонков прослушано` : 'Нет звонков'}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Won Amount */}
                    <td className="px-4 py-3 text-right">
                      <div className="font-mono font-bold text-foreground">
                        {Math.round(rep.won_amount).toLocaleString('ru-RU')} ₽
                      </div>
                      {team && team.total_won_amount > 0 && (
                        <div className="text-[10px] text-tertiary">
                          {wonPctOfTeam}% выручки
                        </div>
                      )}
                    </td>

                    {/* Deals count (Won / Lost / Active) */}
                    <td className="px-4 py-3 text-center">
                      <span className="font-mono text-xs">
                        <span className="text-emerald-400 font-bold">{rep.won_count}</span>
                        <span className="text-tertiary"> / </span>
                        <span className="text-rose-400">{rep.lost_count}</span>
                        <span className="text-tertiary"> / </span>
                        <span className="text-secondary">{rep.active_count}</span>
                      </span>
                    </td>

                    {/* Win Rate */}
                    <td className="px-4 py-3 text-right font-mono">
                      <span className={wrColor}>
                        {rep.won_count + rep.lost_count > 0 ? `${rep.win_rate_pct}%` : '—'}
                      </span>
                    </td>

                    {/* AOV */}
                    <td className="px-4 py-3 text-right font-mono text-foreground">
                      {rep.won_count > 0 ? (
                        <span>{Math.round(rep.avg_deal_amount).toLocaleString('ru-RU')} ₽</span>
                      ) : (
                        <span className="text-tertiary">—</span>
                      )}
                    </td>

                    {/* Median Cycle Days */}
                    <td className="px-4 py-3 text-right font-mono text-secondary">
                      {rep.cycle_days_median !== null ? `${rep.cycle_days_median} дн.` : '—'}
                    </td>

                    {/* Speech AI score */}
                    <td className="px-4 py-3 text-center">
                      {rep.speech_score_avg !== null ? (
                        <Badge
                          variant="outline"
                          className={cn('font-mono font-bold text-[11px] px-2 py-0.5', speechColor)}
                        >
                          {rep.speech_score_avg}
                        </Badge>
                      ) : (
                        <span className="text-tertiary">—</span>
                      )}
                    </td>

                    {/* Next Step rate */}
                    <td className="px-4 py-3 text-right font-mono">
                      <span
                        className={cn(
                          rep.next_step_pct >= 75
                            ? 'text-emerald-400 font-semibold'
                            : rep.next_step_pct >= 50
                              ? 'text-secondary'
                              : 'text-rose-400'
                        )}
                      >
                        {rep.calls_count > 0 ? `${rep.next_step_pct}%` : '—'}
                      </span>
                    </td>

                    {/* SLA risk amount */}
                    <td className="px-4 py-3 text-right font-mono">
                      {rep.sla_risk_amount > 0 ? (
                        <span className="text-amber-400 font-semibold">
                          {Math.round(rep.sla_risk_amount).toLocaleString('ru-RU')} ₽
                        </span>
                      ) : (
                        <span className="text-emerald-400 text-[10px]">В норме</span>
                      )}
                    </td>

                    {/* Success driver or weak spot */}
                    <td className="px-4 py-3 max-w-[200px]">
                      {rep.weak_spot ? (
                        <div className="flex items-center gap-1 text-[11px] text-rose-300">
                          <AlertTriangle className="h-3 w-3 shrink-0 text-rose-400" />
                          <span className="truncate">{rep.weak_spot}</span>
                        </div>
                      ) : rep.success_driver ? (
                        <div className="flex items-center gap-1 text-[11px] text-emerald-300">
                          <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-400" />
                          <span className="truncate">{rep.success_driver}</span>
                        </div>
                      ) : (
                        <span className="text-[11px] text-tertiary">Набор данных</span>
                      )}
                    </td>

                    {/* Action */}
                    <td className="px-4 py-3 text-center">
                      {onSelectManager && (
                        <button
                          onClick={() => onSelectManager(rep.manager_name)}
                          className="rounded-md border border-subtle bg-surface px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-hover transition-colors"
                          title={`Смотреть сделки ${rep.manager_name}`}
                        >
                          Сделки
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

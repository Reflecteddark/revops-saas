/**
 * apps/web/src/components/methodology/MethodologyHeatmap.tsx
 *
 * 13-Criteria Methodology Impact Heatmap (Matrix):
 * - Displays net delta (Lift) vs baseline
 * - Mini-progress bar for discipline (Adherence Rate AR)
 * - Dotted border + ⚠️ warning when Adherence < 40% (Sabotage indicator)
 * - One-click launch into X-Ray Drawer
 */

import * as React from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Filter,
  Flame,
  Minus,
  Search,
  Skull,
  Sparkles,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { HeatmapMatrixRow } from '@/types/api';

export interface MethodologyHeatmapProps {
  matrix: HeatmapMatrixRow[];
  loading: boolean;
  onSelectCriterion: (criterion: string) => void;
}

export function MethodologyHeatmap({
  matrix,
  loading,
  onSelectCriterion,
}: MethodologyHeatmapProps) {
  const [filter, setFilter] = React.useState<'all' | 'sabotage' | 'working'>('all');

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

  return (
    <div className="space-y-4" data-testid="methodology-heatmap">
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

      {/* Heatmap Grid / Table */}
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
    </div>
  );
}

export default MethodologyHeatmap;

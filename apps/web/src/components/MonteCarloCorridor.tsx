/**
 * apps/web/src/components/MonteCarloCorridor.tsx
 *
 * Monte Carlo Probabilistic Revenue Corridor widget.
 * Visualizes P10 (Pessimistic), P50 (Base SSOT), and P90 (Optimistic)
 * corridors with target achievement probability gauge.
 */

import * as React from 'react';
import { Activity, ShieldCheck, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MonteCarloCorridorProps {
  p10?: number;
  p50?: number;
  p90?: number;
  monthlyTarget?: number;
  confidenceScore?: number;
  hasRealData?: boolean;
  className?: string;
}

export function MonteCarloCorridor({
  p10 = 2000000,
  p50 = 3500000,
  p90 = 4800000,
  monthlyTarget = 3000000,
  confidenceScore = 0,
  hasRealData = false,
  className,
}: MonteCarloCorridorProps) {
  // Compute probability of achieving target based on P10/P50/P90 standard normal approximation
  const probTarget = React.useMemo(() => {
    if (p90 <= p10) return 50;
    const mean = p50;
    const sigma = (p90 - p10) / 2.56;
    if (sigma <= 0) return mean >= monthlyTarget ? 99 : 5;
    const z = (monthlyTarget - mean) / sigma;
    const cdf = 1.0 / (1.0 + Math.exp(-0.07056 * Math.pow(z, 3) - 1.5976 * z));
    return Math.max(1, Math.min(99, Math.round((1.0 - cdf) * 100)));
  }, [p10, p50, p90, monthlyTarget]);

  const statusLabel =
    probTarget >= 75
      ? 'Твердо в плане'
      : probTarget >= 45
      ? 'Требуется дожим'
      : 'Высокий риск дефицита';

  const statusColor =
    probTarget >= 75
      ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
      : probTarget >= 45
      ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
      : 'text-rose-400 bg-rose-500/10 border-rose-500/20';

  const maxVal = Math.max(p90, monthlyTarget) * 1.08;
  const p10Pct = Math.round((p10 / maxVal) * 100);
  const p50Pct = Math.round((p50 / maxVal) * 100);
  const p90Pct = Math.round((p90 / maxVal) * 100);
  const targetPct = Math.round((monthlyTarget / maxVal) * 100);

  return (
    <div
      className={cn('surface rounded-xl p-5 border border-subtle space-y-4', className)}
      data-testid="monte-carlo-corridor"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-hover border border-subtle text-foreground">
            <Activity className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-[13px] font-semibold text-foreground">
              Моделирование выручки Монте-Карло
            </h3>
            <p className="text-xs text-secondary">
              Вероятностный диапазон исходов
              {hasRealData && confidenceScore > 0
                ? ` • достоверность ${Math.round(confidenceScore * 100)}%`
                : ' • оценка по текущей воронке'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold border tabular-nums',
              statusColor
            )}
            data-testid="target-prob-badge"
          >
            {probTarget >= 75 ? (
              <ShieldCheck className="h-3.5 w-3.5" />
            ) : (
              <AlertCircle className="h-3.5 w-3.5" />
            )}
            {probTarget}% вероятность плана ({statusLabel})
          </span>
        </div>
      </div>

      {/* Visual Corridor Bar */}
      <div className="p-4 rounded-lg bg-background/50 border border-subtle space-y-3">
        <div className="relative pt-6 pb-2">
          {/* Target Marker Pin */}
          <div
            className="absolute top-0 -translate-x-1/2 flex flex-col items-center"
            style={{ left: `${targetPct}%` }}
          >
            <span className="text-[10px] font-mono font-bold text-foreground bg-hover px-1.5 py-0.5 rounded border border-subtle tabular-nums whitespace-nowrap">
              Цель: {monthlyTarget.toLocaleString('ru-RU')} ₽
            </span>
            <div className="w-0.5 h-3 bg-foreground/60" />
          </div>

          {/* Main Track */}
          <div className="h-4 w-full rounded-full bg-hover border border-subtle relative overflow-hidden">
            {/* P10 to P90 Gradient Band */}
            <div
              className="absolute h-full rounded-full bg-gradient-to-r from-rose-500/50 via-violet-500/70 to-emerald-500/70"
              style={{
                left: `${p10Pct}%`,
                width: `${Math.max(p90Pct - p10Pct, 5)}%`,
              }}
            />
            {/* P50 Median Marker Line */}
            <div
              className="absolute top-0 bottom-0 w-1 bg-white shadow"
              style={{ left: `${p50Pct}%` }}
            />
          </div>
        </div>

        {/* Legend / Corridor Values Grid */}
        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-subtle text-xs">
          {/* P10 */}
          <div>
            <div className="text-[11px] text-tertiary">P10 (Пессимистичный)</div>
            <div className="font-mono font-bold text-rose-400 tabular-nums">
              {p10.toLocaleString('ru-RU')} ₽
            </div>
            <div className="text-[10px] text-tertiary">Вероятность 90%</div>
          </div>

          {/* P50 */}
          <div className="text-center" title="Статистический диапазон на основе распределения текущих сделок">
            <div className="text-[11px] text-tertiary flex items-center justify-center gap-1">
              <span>P50 (Базовый факт)</span>
              <span className="cursor-help text-tertiary hover:text-foreground">ⓘ</span>
            </div>
            <div className="font-mono font-bold text-foreground tabular-nums">
              {p50.toLocaleString('ru-RU')} ₽
            </div>
            <div className="text-[10px] text-emerald-400 font-medium">Медианный исход</div>
          </div>

          {/* P90 */}
          <div className="text-right">
            <div className="text-[11px] text-tertiary">P90 (Стресс-цель)</div>
            <div className="font-mono font-bold text-emerald-400 tabular-nums">
              {p90.toLocaleString('ru-RU')} ₽
            </div>
            <div className="text-[10px] text-tertiary">При росте конверсий</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MonteCarloCorridor;

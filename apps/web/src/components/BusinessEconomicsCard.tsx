/**
 * apps/web/src/components/BusinessEconomicsCard.tsx
 *
 * MPSTATS-style "Экономика бизнеса" master analytics card with 3 columns:
 * 1. Revenue & Invoiced (Продажи)
 * 2. Losses & Leaks (Потери и риски воронки)
 * 3. Plan & Quality Margin (Выполнение плана и качество)
 */

import { TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BusinessEconomicsProps {
  revenueRub: number;
  revenueTrendPct?: number;
  pipelineRub: number;
  avgCheckRub?: number;

  lossRub: number;
  lossTrendPct?: number;
  stalledDealsCount: number;
  fakeYesCount: number;

  targetRub: number;
  qualityPct: number;
  corridorConfidencePct?: number;

  className?: string;
}

export function BusinessEconomicsCard({
  revenueRub,
  revenueTrendPct,
  pipelineRub,
  avgCheckRub = 0,

  lossRub,
  lossTrendPct,
  stalledDealsCount,
  fakeYesCount,

  targetRub,
  qualityPct,
  corridorConfidencePct = 0,

  className,
}: BusinessEconomicsProps) {
  const planPct = Math.min(
    100,
    Math.round((revenueRub / Math.max(1, targetRub)) * 100)
  );
  const lossRatioPct = Math.min(
    100,
    Math.round((lossRub / Math.max(1, pipelineRub + revenueRub)) * 100)
  );

  return (
    <div
      className={cn(
        'surface space-y-4 rounded-2xl border border-subtle bg-surface p-5 shadow-[0_6px_30px_-6px_rgba(15,23,42,0.05)] sm:p-6',
        className
      )}
      data-testid="business-economics-card"
    >
      <div className="flex items-center justify-between border-b border-subtle pb-3">
        <div className="space-y-0.5">
          <h2 className="text-balance text-base font-bold tracking-tight text-foreground">
            Экономика продаж & Финансовый контур
          </h2>
          <p className="text-pretty text-xs text-secondary">
            Сквозной срез выручки, сопутствующих потерь воронки и достижения
            плана P90
          </p>
        </div>
        <span className="font-mono text-xs text-tertiary">
          Расчёт по SSOT формулам
        </span>
      </div>

      <div className="grid grid-cols-1 gap-6 divide-y divide-subtle md:grid-cols-3 md:divide-x md:divide-y-0">
        {/* Column 1: Revenue (Продажи) */}
        <div className="space-y-3.5 pr-0 md:pr-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-secondary">
              Выручка факт
            </span>
            {typeof revenueTrendPct === 'number' && (
              <div className="flex items-center gap-1 font-mono text-xs font-semibold text-emerald-500">
                <TrendingUp className="h-3.5 w-3.5" />
                <span>+{revenueTrendPct}%</span>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="font-kpi text-2xl font-bold tabular-nums tracking-tight text-foreground">
              {revenueRub.toLocaleString('ru-RU')} ₽
            </div>
            <div className="border-subtle/50 h-2 w-full overflow-hidden rounded-full border bg-hover p-0.5">
              <div
                style={{ width: `${planPct}%` }}
                className="h-full rounded-full bg-emerald-500 transition-all duration-300"
              />
            </div>
            <div className="flex justify-between text-[11px] text-tertiary">
              <span className="font-medium text-emerald-600 dark:text-emerald-400">
                Выполнено {planPct}%
              </span>
              <span>План: {targetRub.toLocaleString('ru-RU')} ₽</span>
            </div>
          </div>

          <div className="border-subtle/50 space-y-1.5 border-t pt-2 text-xs">
            <div className="flex items-center justify-between text-secondary">
              <span>Пайплайн в работе</span>
              <span className="font-mono font-medium text-foreground">
                {pipelineRub.toLocaleString('ru-RU')} ₽
              </span>
            </div>
            <div className="flex items-center justify-between text-secondary">
              <span>Средний чек сделки</span>
              <span className="font-mono font-medium text-foreground">
                {avgCheckRub > 0
                  ? `${avgCheckRub.toLocaleString('ru-RU')} ₽`
                  : '—'}
              </span>
            </div>
          </div>
        </div>

        {/* Column 2: Losses & Risk (Потери и узкие места) */}
        <div className="space-y-3.5 pt-4 md:px-4 md:pt-0">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-secondary">
              Потери и риски
            </span>
            {typeof lossTrendPct === 'number' && (
              <div className="flex items-center gap-1 font-mono text-xs font-semibold text-emerald-500">
                <TrendingDown className="h-3.5 w-3.5" />
                <span>{lossTrendPct}%</span>
              </div>
            )}
          </div>

          <div className="space-y-1">
            <div className="font-kpi text-2xl font-bold tabular-nums tracking-tight text-rose-500">
              {lossRub.toLocaleString('ru-RU')} ₽
            </div>
            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-hover">
                <div
                  style={{ width: `${lossRatioPct}%` }}
                  className="h-full rounded-full bg-rose-500 transition-all duration-300"
                />
              </div>
              <span className="font-mono text-[11px] text-tertiary">
                {lossRatioPct}% от объёма
              </span>
            </div>
          </div>

          <div className="border-subtle/50 space-y-1.5 border-t pt-2 text-xs">
            <div className="flex items-center justify-between text-secondary">
              <span>Зависло без Next Step</span>
              <span className="font-mono font-medium text-rose-400">
                {stalledDealsCount} сделок
              </span>
            </div>
            <div className="flex items-center justify-between text-secondary">
              <span>Ложные согласия (Fake-Yes)</span>
              <span className="font-mono font-medium text-amber-400">
                {fakeYesCount} срывов
              </span>
            </div>
          </div>
        </div>

        {/* Column 3: Plan & Quality Margin (Выполнение и маржа качества) */}
        <div className="space-y-3.5 pl-0 pt-4 md:pl-4 md:pt-0">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-secondary">
              Цель P90 и качество
            </span>
            <div className="flex items-center gap-1 font-mono text-xs font-semibold text-primary">
              <span>{planPct}% плана</span>
            </div>
          </div>

          <div className="space-y-1">
            <div className="font-kpi text-2xl font-bold tabular-nums tracking-tight text-foreground">
              {qualityPct}%
            </div>
            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-hover">
                <div
                  style={{ width: `${planPct}%` }}
                  className="h-full rounded-full bg-primary transition-all duration-300"
                />
              </div>
              <span className="font-mono text-[11px] text-tertiary">
                {targetRub.toLocaleString('ru-RU')} ₽ план
              </span>
            </div>
          </div>

          <div className="border-subtle/50 space-y-1.5 border-t pt-2 text-xs">
            <div className="flex items-center justify-between text-secondary">
              <span>Стандарты звонков ОП</span>
              <span className="font-mono font-medium text-emerald-400">
                {qualityPct}/100
              </span>
            </div>
            <div className="flex items-center justify-between text-secondary">
              <span>Точность Монте-Карло</span>
              <span className="font-mono font-medium text-cyan-400">
                {corridorConfidencePct > 0 ? `${corridorConfidencePct}%` : '—'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default BusinessEconomicsCard;

/**
 * apps/web/src/components/ExpressScenarioCalculator.tsx
 *
 * Interactive Express Financial Scenario Calculator for RevOps OS.
 * Models revenue uplift, pipeline losses, and P50/P90 targets
 * based on leads volume, average check, and sales team capacity.
 */

import * as React from 'react';
import { Calculator, TrendingUp, AlertTriangle, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ExpressScenarioCalculatorProps {
  initialLeads?: number;
  initialCheck?: number;
  initialManagers?: number;
  className?: string;
}

export function ExpressScenarioCalculator({
  initialLeads = 50,
  initialCheck = 300000,
  initialManagers = 4,
  className,
}: ExpressScenarioCalculatorProps) {
  const [leads, setLeads] = React.useState<number>(initialLeads);
  const [avgCheck, setAvgCheck] = React.useState<number>(initialCheck);
  const [managers, setManagers] = React.useState<number>(initialManagers);
  const upliftPct = 15;

  // Financial calculations
  const currentPipeline = leads * avgCheck;
  const leakAmount = Math.round(currentPipeline * 0.28);
  const basePlan = Math.round(currentPipeline * 0.25);
  const optPlan = Math.round(basePlan * (1 + upliftPct / 100) * 1.15);
  const addedRevenue = optPlan - basePlan;

  return (
    <div
      className={cn('surface rounded-2xl p-4 border border-subtle space-y-4', className)}
      data-testid="express-scenario-calculator"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-hover border border-subtle text-foreground">
            <Calculator className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-[13px] font-semibold text-foreground text-balance">
              Экспресс-пересчет сценариев P50 / P90
            </h3>
            <p className="text-xs text-secondary text-pretty">
              Моделирование влияния роста стандартов и устранения сливов на выручку
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 tabular-nums">
          <Sparkles className="h-3 w-3" />
          +{addedRevenue.toLocaleString('ru-RU')} ₽ к плану
        </span>
      </div>

      {/* Sliders Grid — R_inner = 16 - 12 = 4px (rounded) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-3 rounded bg-background/50 border border-subtle">
        {/* Leads Slider */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-secondary font-medium">Лидов в месяц:</span>
            <span className="font-mono font-bold text-foreground tabular-nums">
              {leads} шт
            </span>
          </div>
          <input
            type="range"
            min={10}
            max={300}
            step={5}
            value={leads}
            onChange={(e) => setLeads(Number(e.target.value))}
            className="w-full accent-violet-500 cursor-pointer h-1.5 bg-hover rounded-lg appearance-none"
            data-testid="slider-leads"
          />
          <div className="flex justify-between text-[10px] text-tertiary">
            <span>10</span>
            <span>300</span>
          </div>
        </div>

        {/* Average Check Slider */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-secondary font-medium">Средний чек:</span>
            <span className="font-mono font-bold text-foreground tabular-nums">
              {avgCheck.toLocaleString('ru-RU')} ₽
            </span>
          </div>
          <input
            type="range"
            min={50000}
            max={2000000}
            step={25000}
            value={avgCheck}
            onChange={(e) => setAvgCheck(Number(e.target.value))}
            className="w-full accent-violet-500 cursor-pointer h-1.5 bg-hover rounded-lg appearance-none"
            data-testid="slider-check"
          />
          <div className="flex justify-between text-[10px] text-tertiary">
            <span>50K</span>
            <span>2M</span>
          </div>
        </div>

        {/* Managers Capacity Slider */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-secondary font-medium">Менеджеров ОП:</span>
            <span className="font-mono font-bold text-foreground tabular-nums">
              {managers} чел
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={20}
            step={1}
            value={managers}
            onChange={(e) => setManagers(Number(e.target.value))}
            className="w-full accent-violet-500 cursor-pointer h-1.5 bg-hover rounded-lg appearance-none"
            data-testid="slider-managers"
          />
          <div className="flex justify-between text-[10px] text-tertiary">
            <span>1</span>
            <span>20</span>
          </div>
        </div>
      </div>

      {/* 3 Outcome Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Loss Card */}
        <div className="surface rounded p-3.5 border border-rose-500/20 bg-rose-500/[0.03] space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-rose-400 font-medium">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span className="text-balance">Сливы без контроля (28%)</span>
          </div>
          <div
            className="font-mono text-lg font-bold text-rose-400 tabular-nums"
            data-testid="exp-lost-rev"
          >
            {leakAmount.toLocaleString('ru-RU')} ₽
          </div>
          <p className="text-[11px] text-tertiary text-pretty">
            Потери пайплайна при отсутствии четкого Next Step
          </p>
        </div>

        {/* Base Plan Card */}
        <div className="surface rounded p-3.5 border border-subtle bg-hover/20 space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-secondary font-medium">
            <span className="text-balance">Базовый факт (конверсия 25%)</span>
          </div>
          <div
            className="font-mono text-lg font-bold text-foreground tabular-nums"
            data-testid="exp-base-plan"
          >
            {basePlan.toLocaleString('ru-RU')} ₽
          </div>
          <p className="text-[11px] text-tertiary text-pretty">
            Текущий сценарий (по введённым параметрам)
          </p>
        </div>

        {/* Optimized Plan Card */}
        <div className="surface rounded p-3.5 border border-emerald-500/25 bg-emerald-500/[0.04] space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
            <TrendingUp className="h-3.5 w-3.5" />
            <span className="text-balance">Сценарий с RevOps OS</span>
          </div>
          <div
            className="font-mono text-lg font-bold text-emerald-400 tabular-nums"
            data-testid="exp-opt-plan"
          >
            {optPlan.toLocaleString('ru-RU')} ₽
          </div>
          <p className="text-[11px] text-tertiary text-pretty">
            Рост выручки за счет соблюдения 13 стандартов диалога
          </p>
        </div>
      </div>
    </div>
  );
}

export default ExpressScenarioCalculator;

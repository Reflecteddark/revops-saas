/**
 * apps/web/src/components/rnp/RnpFinanceView.tsx
 *
 * Financial & Margin RNP View (TrueStats & Salesforce Revenue Intelligence style):
 * - Plan vs Fact Revenue & Pacing
 * - Weighted Pipeline (вероятностная выручка с учетом конверсии стадий)
 * - Pipeline Coverage Ratio (коэффициент покрытия остатка плана)
 * - Productivity per Head (выручка на 1 менеджера)
 * - Stage Capitalization breakdown (замороженный капитал по этапам)
 */

import * as React from 'react';
import {
  CircleDollarSign,
  ShieldCheck,
  Scale,
  Briefcase,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Deal, ManagerConfig, StageConfig } from '@/types/api';

export interface RnpFinanceViewProps {
  deals: Deal[];
  managers: ManagerConfig[];
  stages: StageConfig[];
  planTarget: number;
  revenue: number;
}

export function RnpFinanceView({
  deals,
  managers,
  stages,
  planTarget,
  revenue,
}: RnpFinanceViewProps) {
  const isWonOrLost = React.useCallback((d: Deal) => {
    if (d.status === 'won' || d.status === 'lost') return true;
    const st = (d.stage || '').toLowerCase();
    return st.includes('успешн') || st.includes('оплач') || st.includes('won') || st.includes('закрыт') || st.includes('отказ');
  }, []);

  // Total raw pipeline (active in-progress deals)
  const pipelineSum = React.useMemo(() => {
    return deals
      .filter((d) => !isWonOrLost(d))
      .reduce((acc, d) => acc + (d.amount || 0), 0);
  }, [deals, isWonOrLost]);

  // Stage probability map
  const stageWeights = React.useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of stages) {
      map[s.name.toLowerCase()] = s.win_pct / 100;
    }
    return map;
  }, [stages]);

  // Weighted Pipeline: sum(deal.amount * stage_win_pct)
  const weightedPipeline = React.useMemo(() => {
    let sum = 0;
    for (const d of deals) {
      if (isWonOrLost(d)) continue;
      const stName = (d.stage || '').toLowerCase();
      // Match with configured stages or fallback heuristic
      let weight = 0.35;
      for (const [key, w] of Object.entries(stageWeights)) {
        if (stName.includes(key) || key.includes(stName)) {
          weight = w;
          break;
        }
      }
      if (stName.includes('кп') || stName.includes('предлож')) weight = Math.max(weight, 0.55);
      if (stName.includes('счет') || stName.includes('договор')) weight = Math.max(weight, 0.85);

      sum += (d.amount || 0) * weight;
    }
    return Math.round(sum);
  }, [deals, isWonOrLost, stageWeights]);

  // Remaining plan deficit
  const remainingTarget = Math.max(0, planTarget - revenue);

  // Pipeline Coverage Ratio = Pipeline / Remaining Target
  const coverageRatio = remainingTarget > 0 ? Math.round((pipelineSum / remainingTarget) * 10) / 10 : 9.9;

  // Productivity per Head
  const activeMgrsCount = Math.max(1, managers.length);
  const revenuePerHead = Math.round(revenue / activeMgrsCount);

  // Stage capitalization breakdown
  const stageBreakdown = React.useMemo(() => {
    const map: Record<string, { amount: number; count: number }> = {};
    for (const d of deals) {
      if (isWonOrLost(d)) continue;
      const st = d.stage || 'Первый контакт';
      if (!map[st]) map[st] = { amount: 0, count: 0 };
      map[st].amount += d.amount || 0;
      map[st].count += 1;
    }

    const items = Object.entries(map).map(([stage, data]) => ({
      stage,
      amount: data.amount,
      count: data.count,
      pct: pipelineSum > 0 ? Math.round((data.amount / pipelineSum) * 100) : 0,
    }));

    items.sort((a, b) => b.amount - a.amount);
    return items;
  }, [deals, pipelineSum]);

  return (
    <div className="space-y-6" data-testid="rnp-finance-view">
      {/* 1. Master Financial KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-subtle bg-surface">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs text-tertiary flex items-center justify-between">
              <span>План выручки (Цель)</span>
              <CircleDollarSign className="h-4 w-4 text-emerald-400" />
            </CardDescription>
            <CardTitle className="text-xl sm:text-2xl font-bold font-mono text-foreground">
              {planTarget.toLocaleString('ru-RU')} ₽
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-[11px] text-tertiary">
              Факт MTD: <strong className="text-foreground">{revenue.toLocaleString('ru-RU')} ₽</strong> ({Math.round((revenue / (planTarget || 1)) * 100)}%)
            </span>
          </CardContent>
        </Card>

        <Card
          className="border-subtle bg-surface"
          title="Пайплайн × вес этапа (упрощённый расчёт)"
        >
          <CardHeader className="pb-2">
            <CardDescription className="text-xs text-tertiary flex items-center justify-between">
              <span className="flex items-center gap-1">
                <span>Взвешенный пайплайн</span>
                <span className="cursor-help text-tertiary hover:text-foreground">ⓘ</span>
              </span>
              <Scale className="h-4 w-4 text-sky-400" />
            </CardDescription>
            <CardTitle className="text-xl sm:text-2xl font-bold font-mono text-sky-400">
              {weightedPipeline.toLocaleString('ru-RU')} ₽
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-[11px] text-tertiary">
              С учетом вероятности конверсии этапов
            </span>
          </CardContent>
        </Card>

        <Card className="border-subtle bg-surface">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs text-tertiary flex items-center justify-between">
              <span>Покрытие плана (Coverage)</span>
              <ShieldCheck className="h-4 w-4 text-violet-400" />
            </CardDescription>
            <CardTitle className="text-xl sm:text-2xl font-bold font-mono text-foreground">
              {coverageRatio}x
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className={`text-[11px] font-medium ${coverageRatio >= 3 ? 'text-emerald-400' : 'text-amber-400'}`}>
              {coverageRatio >= 3 ? '✓ Норматив 3.0x выполнен' : '⚠ Риск: нужно больше сделок'}
            </span>
          </CardContent>
        </Card>

        <Card className="border-subtle bg-surface">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs text-tertiary flex items-center justify-between">
              <span>Выручка на 1 менеджера</span>
              <Briefcase className="h-4 w-4 text-amber-400" />
            </CardDescription>
            <CardTitle className="text-xl sm:text-2xl font-bold font-mono text-foreground">
              {revenuePerHead.toLocaleString('ru-RU')} ₽
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-[11px] text-tertiary">
              Штат: {activeMgrsCount} ответственных сотрудников
            </span>
          </CardContent>
        </Card>
      </div>

      {/* 2. Capitalization per Stage Breakdown */}
      <div className="surface rounded-2xl border border-subtle p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Капитализация этапов воронки (Сумма в работе)
            </h3>
            <p className="text-xs text-tertiary">
              Распределение {pipelineSum.toLocaleString('ru-RU')} ₽ открытого пайплайна по этапам
            </p>
          </div>
          <Badge variant="outline" className="text-xs font-mono">
            {deals.length} активных сделок
          </Badge>
        </div>

        <div className="space-y-3 pt-2">
          {stageBreakdown.map((item, idx) => (
            <div key={idx} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-foreground">
                  {item.stage} <span className="text-tertiary font-normal">({item.count} сд.)</span>
                </span>
                <span className="font-mono text-foreground font-semibold">
                  {item.amount.toLocaleString('ru-RU')} ₽{' '}
                  <span className="text-tertiary font-normal">({item.pct}%)</span>
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-subtle overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500/80 transition-all duration-300"
                  style={{ width: `${item.pct}%` }}
                />
              </div>
            </div>
          ))}

          {stageBreakdown.length === 0 && (
            <div className="py-6 text-center text-xs text-tertiary">
              Нет активных сделок в воронке.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * apps/web/src/components/PipelineFunnel.tsx
 *
 * SSOT Sales Pipeline Funnel widget for RevOps OS.
 * Features 5 canonical stages:
 * 1. Квалификация
 * 2. Встреча проведена / Zoom
 * 3. Коммерческое предложение
 * 4. Согласование договора
 * 5. Оплата (Closed-Won)
 */

import * as React from 'react';
import { Filter, Layers } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { Call, Deal, Pipeline } from '@/types/api';

export interface StageData {
  id: string | number;
  name: string;
  amount: number;
  count: number;
  colorClass?: string;
  color?: string;
}

export interface PipelineFunnelProps {
  deals?: Deal[];
  calls?: Call[];
  pipeline?: Pipeline;
  pipelines?: Pipeline[];
  onSelectPipeline?: (pipelineId: string) => void;
  loading?: boolean;
  className?: string;
}

export function PipelineFunnel({
  deals = [],
  calls = [],
  pipeline,
  pipelines = [],
  onSelectPipeline,
  loading = false,
  className,
}: PipelineFunnelProps) {
  const stages: StageData[] = React.useMemo(() => {
    // 1. Dynamic stages from active pipeline if available
    if (pipeline && pipeline.stages && pipeline.stages.length > 0) {
      return pipeline.stages.map((st, idx) => {
        const stNameLower = st.name.toLowerCase();
        let amt = typeof st.total_amount === 'number' ? st.total_amount : 0;
        let cnt = typeof st.deal_count === 'number' ? st.deal_count : 0;

        if (deals && deals.length > 0) {
          const matchingDeals = deals.filter((d) => {
            const dName = (d.stage_name || d.stage || '').toLowerCase();
            if (dName === stNameLower) return true;
            if (st.is_won && (d.status === 'won' || dName.includes('успеш'))) return true;
            if (st.is_lost && (d.status === 'lost' || dName.includes('закрыт') || dName.includes('отказ'))) return true;
            return String(d.stage_id) === String(st.id);
          });
          amt = matchingDeals.reduce((sum, d) => sum + (d.amount || 0), 0);
          cnt = matchingDeals.length;
        }

        return {
          id: st.id || idx,
          name: st.name,
          amount: amt,
          count: cnt,
          color: st.color || undefined,
          colorClass: st.is_won
            ? 'bg-emerald-500'
            : st.is_lost
            ? 'bg-rose-500'
            : 'bg-primary',
        };
      });
    }

    // 2. Canonical 5 stages fallback (SSOT default)
    let val1 = 0, val2 = 0, val3 = 0, val4 = 0, val5 = 0;
    let cnt1 = 0, cnt2 = 0, cnt3 = 0, cnt4 = 0, cnt5 = 0;

    if (deals && deals.length > 0) {
      deals.forEach((d) => {
        const amt = typeof d.amount === 'number' ? d.amount : 0;
        const stId = parseInt(String(d.stage_id || '1'), 10) || 1;
        const isWon = d.status === 'won' || stId >= 5 || String(d.stage || '').toLowerCase().includes('оплат');

        if (isWon) {
          val5 += amt; cnt5 += 1;
          val4 += amt; cnt4 += 1;
          val3 += amt; cnt3 += 1;
          val2 += amt; cnt2 += 1;
          val1 += amt; cnt1 += 1;
        } else if (stId === 4 || String(d.stage || '').toLowerCase().includes('договор')) {
          val4 += amt; cnt4 += 1;
          val3 += amt; cnt3 += 1;
          val2 += amt; cnt2 += 1;
          val1 += amt; cnt1 += 1;
        } else if (stId === 3 || String(d.stage || '').toLowerCase().includes('кп') || String(d.stage || '').toLowerCase().includes('предложен')) {
          val3 += amt; cnt3 += 1;
          val2 += amt; cnt2 += 1;
          val1 += amt; cnt1 += 1;
        } else if (stId === 2 || String(d.stage || '').toLowerCase().includes('zoom') || String(d.stage || '').toLowerCase().includes('встреч')) {
          val2 += amt; cnt2 += 1;
          val1 += amt; cnt1 += 1;
        } else {
          val1 += amt; cnt1 += 1;
        }
      });
    } else if (calls && calls.length > 0) {
      calls.forEach((c) => {
        const amt = c.amount_num || 0;
        const isWon = c.status === 'won';
        const hasZoom = c.next_step === 1 || Boolean(c.cr?.[0] === 1);
        const hasOffer = Boolean(c.cr?.[7] === 1 || c.cr?.[4] === 1);
        const hasContract = Boolean(c.cr?.[11] === 1 || c.cr?.[10] === 1);

        val1 += amt; cnt1 += 1;
        if (hasZoom || hasOffer || hasContract || isWon) {
          val2 += amt; cnt2 += 1;
        }
        if (hasOffer || hasContract || isWon) {
          val3 += amt; cnt3 += 1;
        }
        if (hasContract || isWon) {
          val4 += amt; cnt4 += 1;
        }
        if (isWon) {
          val5 += amt; cnt5 += 1;
        }
      });
    }

    return [
      { id: 1, name: '1. Квалификация', amount: val1, count: cnt1, colorClass: 'bg-violet-500' },
      { id: 2, name: '2. Встреча проведена / Zoom', amount: val2, count: cnt2, colorClass: 'bg-indigo-500' },
      { id: 3, name: '3. Коммерческое предложение', amount: val3, count: cnt3, colorClass: 'bg-sky-500' },
      { id: 4, name: '4. Согласование договора', amount: val4, count: cnt4, colorClass: 'bg-amber-500' },
      { id: 5, name: '5. Оплата (Closed-Won)', amount: val5, count: cnt5, colorClass: 'bg-emerald-500' },
    ];
  }, [deals, calls, pipeline]);

  const maxAmount = Math.max(...stages.map((s) => s.amount), 1);
  const firstStage = stages[0] || { count: 0, amount: 0 };
  const baseCount = Math.max(firstStage.count, 1);
  const lastWonStage =
    stages.find(
      (s) =>
        s.name.toLowerCase().includes('оплат') ||
        s.name.toLowerCase().includes('успеш')
    ) || stages[stages.length - 1];
  const finalWonCount = lastWonStage ? lastWonStage.count : 0;
  const overallConversion =
    firstStage.count > 0 ? Math.round((finalWonCount / baseCount) * 100) : 0;

  if (loading) {
    return (
      <div className={cn('surface rounded-xl p-5 space-y-4', className)} data-testid="pipeline-funnel-loading">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-5 w-20" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="flex justify-between">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-24" />
              </div>
              <Skeleton className="h-2 w-full rounded-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn('surface rounded-xl p-5 border border-subtle space-y-4', className)}
      data-testid="pipeline-funnel"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-hover border border-subtle text-foreground">
            <Layers className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-[13px] font-semibold text-foreground">
                {pipeline?.name ? `Воронка: ${pipeline.name}` : 'Воронка продаж SSOT'}
              </h3>
              {pipelines && pipelines.length > 1 && onSelectPipeline && (
                <select
                  value={pipeline?.id || '0'}
                  onChange={(e) => onSelectPipeline(e.target.value)}
                  className="h-6 rounded border border-subtle bg-surface px-1.5 text-[11px] font-medium text-foreground focus:outline-none"
                  aria-label="Выбор воронки"
                >
                  {pipelines.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <p className="text-xs text-secondary">
              Сквозная конверсия сделок по этапам пайплайна
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold bg-hover border border-subtle text-secondary tabular-nums">
            <Filter className="h-3 w-3 text-tertiary" />
            Конверсия в оплату: <span className="text-foreground">{overallConversion}%</span>
          </span>
        </div>
      </div>

      {/* Funnel Stages List */}
      <div className="space-y-3 pt-1" data-testid="funnel-stages-list">
        {stages.map((stage) => {
          const widthPct = maxAmount > 0 ? Math.min(100, Math.round((stage.amount / maxAmount) * 100)) : 0;
          const convFromTop = stages[0].amount > 0 ? Math.round((stage.amount / stages[0].amount) * 100) : 0;

          return (
            <div key={stage.id} className="group rounded-lg p-2 transition-colors duration-150 hover:bg-hover/50">
              <div className="flex items-center justify-between text-xs mb-1.5 gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-medium text-foreground text-[13px] truncate">
                    {stage.name}
                  </span>
                  <span className="text-[11px] text-tertiary tabular-nums shrink-0">
                    ({stage.count} {stage.count === 1 ? 'сделка' : 'сделок'})
                  </span>
                </div>
                <div className="flex items-center gap-3 shrink-0 font-mono text-[13px] tabular-nums">
                  <span className="text-xs text-tertiary">{convFromTop}%</span>
                  <span className="font-semibold text-foreground">
                    {stage.amount.toLocaleString('ru-RU')} ₽
                  </span>
                </div>
              </div>

              {/* Progress Track */}
              <div className="h-2 w-full overflow-hidden rounded-full bg-hover border border-subtle">
                <div
                  className={cn('h-full rounded-full transition-all duration-500 ease-out', stage.colorClass)}
                  style={{
                    width: `${Math.max(widthPct, stage.count > 0 ? 3 : 0)}%`,
                    backgroundColor: stage.color || undefined,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default PipelineFunnel;

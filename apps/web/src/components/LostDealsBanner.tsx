/**
 * apps/web/src/components/LostDealsBanner.tsx
 *
 * "Lost Deals Yesterday" operational widget.
 * Displays green shield success state when 0 leaks occurred yesterday,
 * or alert breakdown of stalled/lost deals with "In review" action.
 */

import * as React from 'react';
import { CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Call } from '@/types/api';

export interface LostDealsBannerProps {
  calls?: Call[];
  onInspectCall?: (call: Call) => void;
  title?: string;
  filterYesterdayOnly?: boolean;
  className?: string;
}

function getInitials(name?: string): string {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function formatLeakAmount(call: Call): string {
  if (call.amount_num && call.amount_num > 0) {
    return `${call.amount_num.toLocaleString('ru-RU')} ₽`;
  }
  if (call.amount) {
    return call.amount;
  }
  return '0 ₽';
}

function parseCallDate(rawDate?: string): Date | null {
  if (!rawDate) return null;
  const d = new Date(rawDate);
  if (!isNaN(d.getTime())) return d;
  return null;
}

export function LostDealsBanner({
  calls = [],
  onInspectCall,
  title = 'Слитые сделки за вчера',
  filterYesterdayOnly = false,
  className,
}: LostDealsBannerProps) {
  const leaks = React.useMemo(() => {
    if (!calls || calls.length === 0) return [];

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);

    return calls.filter((c) => {
      if (!c) return false;
      const isLost = c.status === 'lost' || c.status === 'risk' || c.next_step === 0;
      if (!isLost || c.status === 'won') return false;

      if (!filterYesterdayOnly) return true;

      const callDate = parseCallDate(c.date || c.created_at);
      if (!callDate) return true; // If date cannot be parsed, keep in filter
      return callDate >= startOfYesterday && callDate < startOfToday;
    });
  }, [calls, filterYesterdayOnly]);

  const sortedLeaks = React.useMemo(() => {
    return [...leaks]
      .sort((a, b) => (b.amount_num || 0) - (a.amount_num || 0))
      .slice(0, 5);
  }, [leaks]);

  const totalSum = React.useMemo(() => {
    return leaks.reduce((acc, c) => acc + (c.amount_num || 0), 0);
  }, [leaks]);

  // Zero Leaks State (Green Shield)
  if (leaks.length === 0) {
    return (
      <div
        className={cn(
          'surface rounded-xl p-5 border border-emerald-500/20 bg-emerald-500/[0.03]',
          className
        )}
        data-testid="lost-deals-banner"
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 ring-1 ring-inset ring-emerald-500/20">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-[13px] font-semibold text-emerald-400">
                  Вчера сливов не было. Отличная работа!
                </h3>
              </div>
              <p className="text-xs text-secondary mt-0.5">
                Все звонки зафиксировали договоренность о следующем шаге (Next Step 100%).
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium bg-emerald-500/10 text-emerald-400 ring-1 ring-inset ring-emerald-500/20 shrink-0">
            ✓ 0 сливов
          </span>
        </div>
      </div>
    );
  }

  // Active Leaks State
  const sumFormatted =
    totalSum >= 1_000_000
      ? `${(totalSum / 1_000_000).toFixed(1).replace('.0', '')}M ₽`
      : totalSum >= 1_000
      ? `${Math.round(totalSum / 1_000)}K ₽`
      : `${totalSum} ₽`;

  const dealsWord =
    leaks.length % 10 === 1 && leaks.length % 100 !== 11
      ? 'сделка'
      : [2, 3, 4].includes(leaks.length % 10) && ![12, 13, 14].includes(leaks.length % 100)
      ? 'сделки'
      : 'сделок';

  return (
    <div
      className={cn('surface rounded-xl p-5 border border-rose-500/20 space-y-4', className)}
      data-testid="lost-deals-banner"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-500/10 text-rose-400">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>
            <p className="text-xs text-secondary">
              Сделки с риском потери клиента без зафиксированного следующего шага
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold bg-rose-500/10 text-rose-400 ring-1 ring-inset ring-rose-500/20 shrink-0 tabular-nums">
          {leaks.length} {dealsWord} · {sumFormatted}
        </span>
      </div>

      {/* Leaks List */}
      <div className="divide-y divide-subtle rounded-lg border border-subtle overflow-hidden bg-background/50">
        {sortedLeaks.map((call) => {
          const initials = getInitials(call.manager);
          const reason = call.error_summary || 'Нет точной даты/времени следующего шага';
          const amountStr = formatLeakAmount(call);

          return (
            <div
              key={call.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 transition-colors duration-150 hover:bg-hover"
            >
              <div className="flex items-start sm:items-center gap-3 min-w-0">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-500/10 border border-rose-500/30 text-xs font-bold text-rose-300">
                  {initials}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] font-semibold text-foreground">
                      {call.manager || 'Менеджер'}
                    </span>
                    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-rose-500/10 text-rose-400 border border-rose-500/20">
                      СЛИВ (НЕТ NEXT STEP)
                    </span>
                  </div>
                  <div className="text-xs text-secondary mt-0.5 truncate">
                    Клиент: <strong className="text-foreground font-medium">{call.client || 'Клиент'}</strong>
                    {call.deal_title ? ` · ${call.deal_title}` : ''}
                    <span className="text-tertiary ml-1.5">· {reason}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pl-11 sm:pl-0">
                <span className="font-mono text-sm font-semibold tabular-nums text-rose-400">
                  {amountStr}
                </span>
                {onInspectCall && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onInspectCall(call)}
                    className="h-7 text-xs border-rose-500/30 text-rose-300 hover:text-rose-200 hover:bg-rose-500/10"
                  >
                    Разбор
                    <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default LostDealsBanner;

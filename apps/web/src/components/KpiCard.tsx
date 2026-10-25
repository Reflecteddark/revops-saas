/**
 * apps/web/src/components/KpiCard.tsx
 *
 * Reusable KPI Card component with tabular-nums formatting,
 * inverted trend support, skeleton loading, and premium surface styling.
 */

import * as React from 'react';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export interface KpiCardProps {
  title: string;
  value: string | number;
  unit?: string; // '₽', '%', 'шт'
  trend?: {
    direction: 'up' | 'down' | 'flat';
    value: number; // процент изменения
    label?: string; // 'за неделю', 'vs прошлый месяц'
    inverted?: boolean;
  };
  inverted?: boolean; // top-level prop or via trend.inverted
  icon?: React.ReactNode; // lucide-react icon
  loading?: boolean; // skeleton
  variant?: 'default' | 'accent' | 'danger'; // danger — подсветка для sla_risk
  onClick?: () => void;
  className?: string;
}

export function KpiCard({
  title,
  value,
  unit,
  trend,
  inverted = false,
  icon,
  loading = false,
  variant = 'default',
  onClick,
  className,
}: KpiCardProps) {
  const isTrendInverted = inverted || Boolean(trend?.inverted);

  // Compute trend pill color based on inverted semantic flag
  let trendColorClass = 'text-secondary bg-hover';
  if (trend) {
    if (trend.direction === 'up') {
      trendColorClass = isTrendInverted
        ? 'text-red-500 bg-rose-500/10 dark:text-rose-400'
        : 'text-emerald-500 bg-emerald-500/10 dark:text-emerald-400';
    } else if (trend.direction === 'down') {
      trendColorClass = isTrendInverted
        ? 'text-emerald-500 bg-emerald-500/10 dark:text-emerald-400'
        : 'text-red-500 bg-rose-500/10 dark:text-rose-400';
    } else {
      trendColorClass = 'text-secondary bg-hover';
    }
  }

  const isDanger = variant === 'danger';

  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={cn(
        'surface relative overflow-hidden p-5 transition-colors duration-150 hover:border-strong',
        isDanger &&
          'before:absolute before:inset-y-3 before:left-0 before:w-0.5 before:rounded-full before:bg-rose-500 bg-gradient-to-r from-rose-500/[0.05] to-transparent',
        onClick &&
          'cursor-pointer hover:bg-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/50',
        className
      )}
    >
      <div className="flex items-center justify-between pb-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-tertiary">
          {title}
        </span>
        {icon && <div className="text-tertiary">{icon}</div>}
      </div>

      <div>
        {loading ? (
          <div className="space-y-2 py-1" data-testid="kpi-skeleton">
            <Skeleton className="h-9 w-28" />
            <Skeleton className="h-4 w-20" />
          </div>
        ) : (
          <>
            <div className="flex items-baseline">
              <span className="text-4xl font-semibold tabular-nums tracking-tight text-foreground font-kpi">
                {value}
              </span>
              {unit && (
                <span className="ml-1 text-lg font-medium text-tertiary">
                  {unit}
                </span>
              )}
            </div>

            {trend && (
              <div className="mt-2.5 flex items-center text-xs">
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums',
                    trendColorClass
                  )}
                >
                  {trend.direction === 'up' && (
                    <>
                      <ArrowUp
                        className="h-3 w-3 mr-0.5"
                        data-testid="trend-up"
                      />
                      +{trend.value}%
                    </>
                  )}
                  {trend.direction === 'down' && (
                    <>
                      <ArrowDown
                        className="h-3 w-3 mr-0.5"
                        data-testid="trend-down"
                      />
                      -{trend.value}%
                    </>
                  )}
                  {trend.direction === 'flat' && (
                    <>
                      <Minus
                        className="h-3 w-3 mr-0.5"
                        data-testid="trend-flat"
                      />
                      {trend.value}%
                    </>
                  )}
                </span>
                {trend.label && (
                  <span className="ml-1.5 text-xs text-tertiary">
                    {trend.label}
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default KpiCard;

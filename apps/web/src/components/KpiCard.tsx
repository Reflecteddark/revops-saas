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
  variant?: 'default' | 'accent' | 'danger';
  subtitle?: React.ReactNode; // danger — подсветка для sla_risk
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
  subtitle,
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
        'surface relative overflow-hidden rounded-2xl border border-border-subtle bg-surface p-4 shadow-[0_4px_20px_-4px_rgba(15,23,42,0.05)] transition-all duration-200 hover:-translate-y-0.5 hover:border-strong hover:shadow-[0_12px_25px_-4px_rgba(15,23,42,0.08)] sm:p-5',
        isDanger &&
          'border-rose-200/80 bg-gradient-to-b from-rose-50/40 to-surface before:absolute before:inset-y-3 before:left-0 before:w-1 before:rounded-full before:bg-rose-500 dark:border-rose-500/20 dark:from-rose-500/[0.04] dark:to-surface',
        onClick &&
          'focus-visible:ring-accent/50 cursor-pointer hover:bg-hover focus-visible:outline-none focus-visible:ring-1',
        className
      )}
    >
      <div className="flex items-center justify-between pb-2">
        <span className="text-balance text-[11px] font-semibold uppercase tracking-[0.06em] text-tertiary">
          {title}
        </span>
        <div className="flex items-center gap-2">
          {isDanger && (
            <span
              className="relative flex h-2 w-2 shrink-0"
              title="Требуется внимание"
            >
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500"></span>
            </span>
          )}
          {icon && <div className="text-tertiary">{icon}</div>}
        </div>
      </div>

      <div>
        {loading ? (
          <div className="space-y-2 py-1" data-testid="kpi-skeleton">
            <Skeleton className="h-9 w-28" />
            <Skeleton className="h-4 w-20" />
          </div>
        ) : (
          <>
            <div className="flex items-baseline justify-between">
              <div className="flex items-baseline">
                <span className="font-kpi text-4xl font-semibold tabular-nums tracking-tight text-foreground">
                  {value}
                </span>
                {unit && (
                  <span className="ml-1 text-lg font-medium text-tertiary">
                    {unit}
                  </span>
                )}
              </div>

              {/* Stripe Sparkline Wave */}
              <div className="hidden opacity-80 transition-opacity hover:opacity-100 sm:block">
                {trend?.direction === 'up' && (
                  <svg
                    className="h-6 w-16 overflow-visible text-emerald-500"
                    viewBox="0 0 100 30"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <path
                      d="M0 25 Q 25 22, 40 15 T 75 12 T 100 4"
                      strokeLinecap="round"
                    />
                  </svg>
                )}
                {trend?.direction === 'down' && (
                  <svg
                    className="h-6 w-16 overflow-visible text-rose-500"
                    viewBox="0 0 100 30"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <path
                      d="M0 8 Q 30 15, 60 22 T 100 25"
                      strokeLinecap="round"
                    />
                  </svg>
                )}
                {trend?.direction === 'flat' && (
                  <svg
                    className="h-6 w-16 overflow-visible text-slate-400"
                    viewBox="0 0 100 30"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <path
                      d="M0 15 Q 30 18, 50 12 T 80 16 T 100 14"
                      strokeLinecap="round"
                    />
                  </svg>
                )}
                {!trend && isDanger && (
                  <svg
                    className="h-6 w-16 overflow-visible text-rose-500"
                    viewBox="0 0 100 30"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <path
                      d="M0 24 Q 40 20, 60 10 T 100 6"
                      strokeLinecap="round"
                    />
                  </svg>
                )}
              </div>
            </div>

            {trend && (
              <div className="mt-2.5 flex items-center text-xs">
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border border-transparent px-2 py-0.5 text-xs font-semibold tabular-nums',
                    trendColorClass
                  )}
                >
                  {trend.direction === 'up' && (
                    <>
                      <ArrowUp
                        className="mr-0.5 h-3 w-3"
                        data-testid="trend-up"
                      />
                      +{trend.value}%
                    </>
                  )}
                  {trend.direction === 'down' && (
                    <>
                      <ArrowDown
                        className="mr-0.5 h-3 w-3"
                        data-testid="trend-down"
                      />
                      -{trend.value}%
                    </>
                  )}
                  {trend.direction === 'flat' && (
                    <>
                      <Minus
                        className="mr-0.5 h-3 w-3"
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
            {subtitle && (
              <div className="mt-1.5 text-xs">
                {subtitle}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default KpiCard;

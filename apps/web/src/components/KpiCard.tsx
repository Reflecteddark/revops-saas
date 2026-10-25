/**
 * apps/web/src/components/KpiCard.tsx
 *
 * Reusable KPI Card component with tabular-nums formatting,
 * trend indicators, skeleton loading, and variant styling.
 */

import * as React from 'react';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  };
  icon?: React.ReactNode; // lucide-react icon
  loading?: boolean; // skeleton
  variant?: 'default' | 'accent' | 'danger'; // accent — фиолетовый #7c3aed, danger — красный для sla_risk
  onClick?: () => void;
  className?: string;
}

export function KpiCard({
  title,
  value,
  unit,
  trend,
  icon,
  loading = false,
  variant = 'default',
  onClick,
  className,
}: KpiCardProps) {
  const variantClasses = {
    default: '',
    accent: 'border-l-4 border-l-[#7c3aed]',
    danger: 'border-l-4 border-l-red-500',
  }[variant];

  return (
    <Card
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={cn(
        'transition-colors',
        variantClasses,
        onClick &&
          'focus-visible:ring-ring cursor-pointer hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2',
        className
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-muted-foreground text-sm font-medium">
          {title}
        </CardTitle>
        {icon && <div className="text-muted-foreground">{icon}</div>}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2 py-1" data-testid="kpi-skeleton">
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-4 w-20" />
          </div>
        ) : (
          <>
            <div className="flex items-baseline">
              <span className="text-3xl font-semibold tabular-nums tracking-tight">
                {value}
              </span>
              {unit && (
                <span className="text-muted-foreground ml-1 text-lg font-normal">
                  {unit}
                </span>
              )}
            </div>

            {trend && (
              <div className="mt-2 flex items-center text-xs">
                {trend.direction === 'up' && (
                  <span className="flex items-center font-medium text-emerald-500">
                    <ArrowUp
                      className="mr-0.5 h-3.5 w-3.5"
                      data-testid="trend-up"
                    />
                    +{trend.value}%
                  </span>
                )}
                {trend.direction === 'down' && (
                  <span className="flex items-center font-medium text-red-500">
                    <ArrowDown
                      className="mr-0.5 h-3.5 w-3.5"
                      data-testid="trend-down"
                    />
                    -{trend.value}%
                  </span>
                )}
                {trend.direction === 'flat' && (
                  <span className="text-muted-foreground flex items-center font-medium">
                    <Minus
                      className="mr-0.5 h-3.5 w-3.5"
                      data-testid="trend-flat"
                    />
                    {trend.value}%
                  </span>
                )}
                {trend.label && (
                  <span className="text-muted-foreground ml-1.5">
                    {trend.label}
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default KpiCard;

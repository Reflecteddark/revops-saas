/**
 * apps/web/src/components/StatusSegmentedBar.tsx
 *
 * MPSTATS-style multi-segment horizontal progress bar visualizing proportional
 * distribution of calls by audit score tiers or deals by funnel statuses.
 */

import { cn } from '@/lib/utils';

export interface StatusSegment {
  id: string;
  label: string;
  count: number;
  colorClass: string; // background color class for the bar segment, e.g. bg-emerald-500
  dotColorClass: string; // dot indicator color class
  amountRub?: number;
}

export interface StatusSegmentedBarProps {
  title: string;
  totalCount: number;
  segments: StatusSegment[];
  className?: string;
}

export function StatusSegmentedBar({
  title,
  totalCount,
  segments,
  className,
}: StatusSegmentedBarProps) {
  const safeTotal = Math.max(1, totalCount);

  return (
    <div
      className={cn(
        'surface rounded-xl border border-subtle p-4 space-y-3.5',
        className
      )}
      data-testid="status-segmented-bar"
    >
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-foreground text-[13px]">{title}</span>
        <span className="font-mono text-tertiary tabular-nums">
          Всего: <strong className="text-foreground">{totalCount}</strong>
        </span>
      </div>

      {/* Segments Legend Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
        {segments.map((seg) => {
          const pct = Math.round((seg.count / safeTotal) * 100);
          return (
            <div key={seg.id} className="flex items-start space-x-2">
              <span
                className={cn('h-2 w-2 rounded-full mt-1 shrink-0', seg.dotColorClass)}
              />
              <div className="space-y-0.5">
                <div className="text-[11px] text-tertiary leading-tight">
                  {seg.label}
                </div>
                <div className="font-medium text-foreground text-xs flex items-center gap-1.5 font-mono">
                  <span>{seg.count}</span>
                  <span className="text-[11px] text-tertiary font-normal">({pct}%)</span>
                </div>
                {seg.amountRub !== undefined && (
                  <div className="text-[10px] text-secondary font-mono">
                    {seg.amountRub.toLocaleString('ru-RU')} ₽
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Multi-segment Horizontal Progress Bar */}
      <div className="h-2.5 w-full rounded-full bg-hover overflow-hidden flex gap-0.5 p-0.5 border border-subtle/50">
        {segments.map((seg) => {
          const pct = (seg.count / safeTotal) * 100;
          if (pct === 0) return null;
          return (
            <div
              key={seg.id}
              style={{ width: `${pct}%` }}
              title={`${seg.label}: ${seg.count} (${Math.round(pct)}%)`}
              className={cn(
                'h-full rounded-sm transition-all duration-300 hover:opacity-85',
                seg.colorClass
              )}
            />
          );
        })}
      </div>
    </div>
  );
}

export default StatusSegmentedBar;

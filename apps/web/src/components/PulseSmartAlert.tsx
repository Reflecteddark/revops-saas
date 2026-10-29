/**
 * apps/web/src/components/PulseSmartAlert.tsx
 *
 * MPSTATS-style contextual smart warning banner highlighting operational
 * pipeline risks and SLA stalls with immediate action buttons.
 */

import * as React from 'react';
import { AlertCircle, ArrowRight, HelpCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface PulseSmartAlertProps {
  stalledCount: number;
  stalledAmountRub: number;
  onResolve?: () => void;
  className?: string;
}

export function PulseSmartAlert({
  stalledCount,
  stalledAmountRub,
  onResolve,
  className,
}: PulseSmartAlertProps) {
  const [dismissed, setDismissed] = React.useState(false);
  const [showHelp, setShowHelp] = React.useState(false);

  if (dismissed || stalledCount === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        'relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 dark:bg-amber-500/5 p-4 text-xs shadow-sm transition-all duration-200',
        className
      )}
      data-testid="pulse-smart-alert"
    >
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-amber-500/20 p-1.5 text-amber-500 shrink-0 mt-0.5">
          <AlertCircle className="h-4 w-4" />
        </div>
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-foreground text-sm">
              У {stalledCount} сделок не зафиксирован следующий шаг (Next Step)
            </span>
            <span className="font-mono font-medium text-amber-500 dark:text-amber-400">
              риск {stalledAmountRub.toLocaleString('ru-RU')} ₽
            </span>
          </div>
          <p className="text-secondary text-xs leading-relaxed">
            Сделки без дедлайна и назначенного контакта дольше 48 часов теряют до 65% конверсии. 
            Добавьте задачу менеджеру для защиты выручки.
          </p>
          {showHelp && (
            <div className="mt-2 rounded-lg bg-surface/80 border border-subtle p-2.5 text-[11px] text-tertiary">
              Регламент B2B-аудита RevOps: критерий <strong>cr10 (Твёрдый Next Step)</strong> является обязательным для перевода сделки на следующий этап воронки.
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowHelp(!showHelp)}
          className="h-8 gap-1.5 text-xs text-secondary hover:text-foreground border-subtle"
        >
          <HelpCircle className="h-3.5 w-3.5 text-amber-500" />
          <span className="hidden sm:inline">Почему это важно?</span>
        </Button>
        {onResolve && (
          <Button
            size="sm"
            onClick={onResolve}
            className="h-8 gap-1.5 text-xs bg-amber-500 hover:bg-amber-600 text-white font-medium shadow-sm"
          >
            <span>Разобрать сделки</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        )}
        <button
          onClick={() => setDismissed(true)}
          className="rounded-lg p-1 text-tertiary hover:bg-hover hover:text-foreground transition-colors ml-1"
          title="Скрыть предупреждение"
          aria-label="Скрыть предупреждение"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export default PulseSmartAlert;

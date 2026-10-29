/**
 * apps/web/src/components/OnboardingChecklist.tsx
 *
 * Interactive onboarding checklist for new clients / empty workspaces.
 * Shows progression towards full RevOps OS activation:
 * 1. CRM Connection
 * 2. First Inbound / Outbound Calls
 * 3. Monthly Sales Plan Configuration
 * 4. Manager Roster Setup
 * 5. Telegram Notification Bot Setup
 *
 * Automatically hides when all 5 steps are completed,
 * or allows manual minimization.
 */

import * as React from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronUp,
  Sparkles,
  ArrowRight,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export interface OnboardingChecklistProps {
  dealsCount: number;
  callsCount: number;
  hasPlan: boolean;
  managersCount: number;
  hasTelegram: boolean;
  className?: string;
}

export function OnboardingChecklist({
  dealsCount,
  callsCount,
  hasPlan,
  managersCount,
  hasTelegram,
  className,
}: OnboardingChecklistProps) {
  const [isDismissed, setIsDismissed] = React.useState(false);
  const [isExpanded, setIsExpanded] = React.useState(true);

  const hasCrm = dealsCount > 0;
  const hasCalls = callsCount > 0;
  const hasManagers = managersCount > 0;

  const items = [
    {
      id: 'crm',
      title: 'Подключите CRM (amoCRM или Битрикс24)',
      description: 'Синхронизация воронок, сделок и этапов продаж',
      isCompleted: hasCrm,
      link: '/integrations',
      linkLabel: 'В интеграции',
    },
    {
      id: 'calls',
      title: 'Дождитесь первых звонков',
      description: 'Аудиозаписи поступают автоматически после звонков в CRM (обычно 1–2 часа)',
      isCompleted: hasCalls,
      link: '/audit',
      linkLabel: 'Реестр звонков',
    },
    {
      id: 'plan',
      title: 'Задайте план продаж на месяц',
      description: 'Необходим для расчёта дефицита, коридора P90 и темпа воронки',
      isCompleted: hasPlan,
      link: '/settings',
      linkLabel: 'В настройки',
    },
    {
      id: 'managers',
      title: 'Добавьте менеджеров отдела продаж',
      description: 'Настройка нормативов, планов и лимитов вместимости',
      isCompleted: hasManagers,
      link: '/settings',
      linkLabel: 'Менеджеры',
    },
    {
      id: 'telegram',
      title: 'Подключите Telegram-бота',
      description: 'Ежедневная утренняя планёрка и алерты срывов сделок в чат РОПа',
      isCompleted: hasTelegram,
      link: '/settings',
      linkLabel: 'Telegram',
    },
  ];

  const completedCount = items.filter((i) => i.isCompleted).length;
  const allCompleted = completedCount === items.length;

  if (allCompleted || isDismissed) {
    return null;
  }

  const progressPct = Math.round((completedCount / items.length) * 100);

  return (
    <div
      className={cn(
        'surface rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/[0.04] via-surface to-surface p-5 shadow-sm transition-all',
        className
      )}
      data-testid="onboarding-checklist"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-foreground">
                Активация контура RevOps OS
              </h3>
              <span className="font-mono text-xs font-semibold text-primary">
                {completedCount} из {items.length} шагов ({progressPct}%)
              </span>
            </div>
            <p className="text-xs text-secondary">
              Выполните шаги настройки, чтобы разблокировать полную сквозную аналитику и аудит
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-7 w-7 p-0 text-tertiary hover:text-foreground"
            title={isExpanded ? 'Свернуть чеклист' : 'Развернуть чеклист'}
            data-testid="btn-toggle-checklist"
          >
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsDismissed(true)}
            className="h-7 w-7 p-0 text-tertiary hover:text-foreground"
            title="Закрыть чеклист"
            data-testid="btn-dismiss-checklist"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mt-3.5 h-1.5 w-full overflow-hidden rounded-full bg-subtle">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Checklist items */}
      {isExpanded && (
        <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <div
              key={item.id}
              className={cn(
                'flex flex-col justify-between rounded-xl border p-3 transition-colors',
                item.isCompleted
                  ? 'border-emerald-500/20 bg-emerald-500/[0.03]'
                  : 'border-subtle bg-surface/50 hover:bg-hover/50'
              )}
              data-testid={`checklist-item-${item.id}`}
            >
              <div className="flex items-start gap-2.5">
                {item.isCompleted ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                ) : (
                  <Circle className="mt-0.5 h-4 w-4 shrink-0 text-tertiary" />
                )}
                <div className="space-y-0.5">
                  <div
                    className={cn(
                      'text-xs font-semibold',
                      item.isCompleted
                        ? 'text-emerald-400 line-through opacity-85'
                        : 'text-foreground'
                    )}
                  >
                    {item.title}
                  </div>
                  <p className="text-[11px] text-tertiary leading-snug">
                    {item.description}
                  </p>
                </div>
              </div>

              {!item.isCompleted && (
                <div className="mt-2.5 flex justify-end">
                  <Link
                    to={item.link}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                  >
                    <span>{item.linkLabel}</span>
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default OnboardingChecklist;

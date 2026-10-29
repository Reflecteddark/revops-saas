/**
 * apps/web/src/components/AiImpactCard.tsx
 *
 * AI Impact Matrix & Fake Yes Alert widget for RevOps OS.
 * Demonstrates correlation between conversation quality tiers
 * and closed revenue, and flags deceptive "Fake Yes" agreements.
 */

import * as React from 'react';
import { CALL_SCORE_THRESHOLDS } from '@/lib/thresholds';
import { Zap, AlertTriangle, ShieldCheck, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Call } from '@/types/api';

export interface AiImpactCardProps {
  calls?: Call[];
  className?: string;
}

interface TierMetrics {
  name: string;
  scoreRange: string;
  count: number;
  winRate: string;
  sumWon: number;
  multiplier: string;
  badgeStyle: string;
  multiplierStyle: string;
}

export function AiImpactCard({ calls = [], className }: AiImpactCardProps) {
  const { tiers, fakeYesCalls, maxSpread } = React.useMemo(() => {
    const lowCalls = calls.filter((c) => (c.score ?? 0) <= CALL_SCORE_THRESHOLDS.low.max);
    const midCalls = calls.filter(
      (c) =>
        (c.score ?? 0) >= CALL_SCORE_THRESHOLDS.mid.min &&
        (c.score ?? 0) <= CALL_SCORE_THRESHOLDS.mid.max
    );
    const highCalls = calls.filter(
      (c) => (c.score ?? 0) >= CALL_SCORE_THRESHOLDS.high.min
    );

    const calcTier = (tierCalls: Call[]) => {
      const count = tierCalls.length;
      const wonCalls = tierCalls.filter((c) => c.status === 'won');
      const countWon = wonCalls.length;
      const rate =
        count > 0 ? `${((countWon / count) * 100).toFixed(1)}%` : '0.0%';
      const sumWon = wonCalls.reduce((acc, c) => acc + (c.amount_num || 0), 0);
      return { count, rate, sumWon };
    };

    const tLow = calcTier(lowCalls);
    const tMid = calcTier(midCalls);
    const tHigh = calcTier(highCalls);

    const lowRateVal = parseFloat(tLow.rate);
    const midRateVal = parseFloat(tMid.rate);
    const highRateVal = parseFloat(tHigh.rate);

    const midMult =
      tMid.count > 0
        ? lowRateVal > 0 && midRateVal > 0
          ? `${(midRateVal / lowRateVal).toFixed(1)}x к базе`
          : midRateVal > 0
            ? 'Выше нормы'
            : 'В рамках нормы'
        : 'Накопление данных';

    const highMult =
      tHigh.count > 0
        ? lowRateVal > 0 && highRateVal > 0
          ? `${(highRateVal / lowRateVal).toFixed(1)}x к базе`
          : highRateVal > 0
            ? 'Максимальная'
            : 'Эталон'
        : 'Накопление данных';

    const maxSpread =
      lowRateVal > 0 && highRateVal > 0
        ? `${(highRateVal / lowRateVal).toFixed(1)}x разрыв в конверсии`
        : tHigh.count > 0
          ? 'Эталонный сегмент'
          : 'Сбор статистики';

    const tierList: TierMetrics[] = [
      {
        name: 'Зона риска (Низкий балл)',
        scoreRange: '0 – 6 баллов',
        count: tLow.count,
        winRate: tLow.rate,
        sumWon: tLow.sumWon,
        multiplier: 'Базовый темп',
        badgeStyle: 'bg-rose-500/10 text-rose-400 border border-rose-500/20',
        multiplierStyle: 'text-tertiary',
      },
      {
        name: 'Рабочая норма (Средний)',
        scoreRange: '6 – 8 баллов',
        count: tMid.count,
        winRate: tMid.rate,
        sumWon: tMid.sumWon,
        multiplier: midMult,
        badgeStyle: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
        multiplierStyle: 'text-amber-300 font-medium',
      },
      {
        name: 'Эталонные переговоры',
        scoreRange: '9 – 13 баллов',
        count: tHigh.count,
        winRate: tHigh.rate,
        sumWon: tHigh.sumWon,
        multiplier: highMult,
        badgeStyle:
          'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
        multiplierStyle: 'text-emerald-400 font-bold',
      },
    ];

    // Fake yes detection: client agreement claimed without concrete next step
    const fakeYes = calls.filter(
      (c) =>
        (c.status === 'fake_yes' || c.status === 'risk') &&
        (c.next_step === 0 || c.next_step === null)
    );

    return { tiers: tierList, fakeYesCalls: fakeYes, maxSpread };
  }, [calls]);

  return (
    <div
      className={cn(
        'surface space-y-5 rounded-xl border border-subtle p-5',
        className
      )}
      data-testid="ai-impact-card"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-subtle bg-hover text-foreground">
            <Zap className="h-4 w-4 text-amber-400" />
          </div>
          <div>
            <h3 className="text-[13px] font-semibold text-foreground">
              Влияние качества диалогов на выручку
            </h3>
            <p className="text-xs text-secondary">
              Зависимость конверсии в оплату от соблюдения стандартов ОП
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-400">
          <ArrowUpRight className="h-3 w-3" />
          {maxSpread}
        </span>
      </div>

      {/* Tier Table Matrix */}
      <div className="bg-background/50 divide-y divide-subtle overflow-hidden rounded-lg border border-subtle">
        <div className="bg-hover/40 grid grid-cols-12 gap-2 px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wider text-tertiary">
          <div className="col-span-4">Уровень переговоров</div>
          <div className="col-span-2 text-center">Диапазон</div>
          <div className="col-span-2 text-center">Конверсия</div>
          <div className="col-span-2 text-right">Факт выручки</div>
          <div className="col-span-2 text-right">Эффект ИИ</div>
        </div>

        {tiers.map((t) => (
          <div
            key={t.name}
            className="hover:bg-hover/30 grid grid-cols-12 items-center gap-2 px-3.5 py-3 text-xs transition-colors"
          >
            <div className="col-span-4 min-w-0">
              <span
                className={cn(
                  'inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium',
                  t.badgeStyle
                )}
              >
                {t.name}
              </span>
              <div className="mt-0.5 text-[11px] text-tertiary">
                {t.count} {t.count === 1 ? 'звонок' : 'звонков'}
              </div>
            </div>

            <div className="col-span-2 text-center font-mono text-secondary">
              {t.scoreRange}
            </div>

            <div className="col-span-2 text-center font-mono font-semibold tabular-nums text-foreground">
              {t.winRate}
            </div>

            <div className="col-span-2 text-right font-mono font-bold tabular-nums text-foreground">
              {t.sumWon.toLocaleString('ru-RU')} ₽
            </div>

            <div
              className={cn(
                'col-span-2 text-right font-mono text-[11px]',
                t.multiplierStyle
              )}
            >
              {t.multiplier}
            </div>
          </div>
        ))}
      </div>

      {/* Fake Yes Alert Strip */}
      <div
        className={cn(
          'flex flex-col justify-between gap-3 rounded-lg border p-3.5 sm:flex-row sm:items-center',
          fakeYesCalls.length > 0
            ? 'border-rose-500/20 bg-rose-500/[0.03]'
            : 'border-emerald-500/20 bg-emerald-500/[0.03]'
        )}
        data-testid="fake-yes-strip"
      >
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
              fakeYesCalls.length > 0
                ? 'bg-rose-500/10 text-rose-400'
                : 'bg-emerald-500/10 text-emerald-400'
            )}
          >
            {fakeYesCalls.length > 0 ? (
              <AlertTriangle className="h-4 w-4" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
          </div>
          <div>
            <div className="text-xs font-semibold text-foreground">
              {fakeYesCalls.length > 0
                ? `${fakeYesCalls.length} алертов «Ложного согласия» (Fake Yes)`
                : 'Алертов ложного согласия не обнаружено'}
            </div>
            <div className="mt-0.5 text-[11px] text-secondary">
              {fakeYesCalls.length > 0
                ? 'Клиент сказал «да/интересно», но менеджер не зафиксировал дату и время следующего шага'
                : 'Все диалоги с согласием клиента подкреплены зафиксированным Next Step'}
            </div>
          </div>
        </div>

        <span
          className={cn(
            'inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-semibold tabular-nums',
            fakeYesCalls.length > 0
              ? 'border border-rose-500/20 bg-rose-500/10 text-rose-400'
              : 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
          )}
        >
          {fakeYesCalls.length > 0
            ? `${fakeYesCalls.length} алертов`
            : 'Чистый лист'}
        </span>
      </div>
    </div>
  );
}

export default AiImpactCard;

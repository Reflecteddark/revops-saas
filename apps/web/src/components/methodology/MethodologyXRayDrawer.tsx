/**
 * apps/web/src/components/methodology/MethodologyXRayDrawer.tsx
 *
 * X-Ray inspection drawer for a single sales criterion:
 * - Cohort breakdown: Script Adhered (SWR) vs Freestyle (FWR)
 * - Net Script Lift (+XX% to stage conversion)
 * - Department discipline (Adherence Rate AR)
 * - Saboteur vs Champion roster by manager
 * - Golden Click-to-Play quotes with timestamps
 * - 1-Click Copy report to Telegram
 */

import * as React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Copy,
  Flame,
  Play,
  Skull,
  Sparkles,
  TrendingUp,
  X,
  Volume2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { apiClient } from '@/lib/api';
import type { XRayResponse } from '@/types/api';

export interface MethodologyXRayDrawerProps {
  criterion: string | null;
  versionId?: string;
  tenantId?: string;
  isOpen: boolean;
  onClose: () => void;
}

export function MethodologyXRayDrawer({
  criterion,
  versionId,
  tenantId,
  isOpen,
  onClose,
}: MethodologyXRayDrawerProps) {
  const [data, setData] = React.useState<XRayResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [playingQuoteIndex, setPlayingQuoteIndex] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (!criterion || !isOpen) {
      setData(null);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    apiClient.methodology
      .getXRay(criterion, versionId, tenantId)
      .then((res) => {
        if (isMounted) setData(res);
      })
      .catch((err) => {
        if (isMounted) setError(err?.message || 'Не удалось загрузить данные рентгена');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [criterion, versionId, tenantId, isOpen]);

  if (!isOpen || !criterion) return null;

  const handleCopyReport = () => {
    if (!data) return;
    const saboteurs = data.managers.filter((m) => m.is_saboteur).map((m) => `${m.name} (${m.ar_pct}% соблюдения)`).join(', ');
    const reportText = `📢 [RevOps Рентген Этапа: ${data.criterion.toUpperCase()} — ${data.title}]\n` +
      `Статус: ${data.verdict_label}\n` +
      `Дисциплина отдела: ${data.stats.ar_pct}%\n` +
      `🔥 По скрипту: ${data.stats.swr_pct}% | 💀 Отсебятина: ${data.stats.fwr_pct}%\n` +
      `🏆 Чистый буст текста: +${data.stats.script_lift_pct}%\n` +
      (saboteurs ? `⚠️ Саботируют внедрение: ${saboteurs}\n` : 'Все менеджеры держат регламент!\n');

    navigator.clipboard.writeText(reportText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const formatTimestamp = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const renderVerdictBadge = () => {
    if (!data) return null;
    switch (data.verdict) {
      case 'WORKING_STANDARD':
        return (
          <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 gap-1.5 px-3 py-1">
            <CheckCircle2 className="h-4 w-4" />
            Рабочий стандарт (Скрипт принят и работает)
          </Badge>
        );
      case 'SABOTAGE_HIDDEN_GEM':
        return (
          <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 gap-1.5 px-3 py-1 animate-pulse">
            <AlertTriangle className="h-4 w-4" />
            Саботаж: Скрытый алмаз (Скрипт пушка, но не говорят)
          </Badge>
        );
      case 'HYPOTHESIS_FAILED':
        return (
          <Badge className="bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30 gap-1.5 px-3 py-1">
            <Skull className="h-4 w-4" />
            Гипотеза провалилась (Формулировка отталкивает)
          </Badge>
        );
      case 'FREESTYLE_STRONGER':
        return (
          <Badge className="bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30 gap-1.5 px-3 py-1">
            <Sparkles className="h-4 w-4" />
            Отсебятина сильнее (Звезды нашли живой крючок)
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="gap-1.5 px-3 py-1">
            <Clock className="h-4 w-4" />
            Сбор данных (Выборка накапливается)
          </Badge>
        );
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm transition-opacity"
      data-testid="methodology-xray-drawer"
    >
      <div className="relative flex h-full w-full max-w-2xl flex-col bg-background p-6 shadow-2xl border-l border-subtle overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-subtle pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-primary">
                {criterion.toUpperCase()}
              </span>
              <span className="text-xs text-muted-foreground">• {data?.stage || 'Рентген этапа'}</span>
            </div>
            <h2 className="text-xl font-bold tracking-tight text-foreground mt-1">
              {data?.title || `Анализ критерия ${criterion.toUpperCase()}`}
            </h2>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0 rounded-full hover:bg-hover"
            data-testid="close-xray-drawer"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {loading ? (
          <div className="space-y-4 py-8">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : error ? (
          <div className="py-12 text-center text-sm text-destructive">{error}</div>
        ) : data ? (
          <div className="space-y-6 py-6">
            {/* Status & Verdict */}
            <div>{renderVerdictBadge()}</div>

            {/* 1. Discipline Section */}
            <Card className="p-4 bg-surface border-subtle space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase text-secondary">
                  1. Дисциплина отдела (Adherence Rate)
                </span>
                <span className="text-xs font-mono font-medium text-foreground">
                  {data.stats.script_calls} из {data.stats.total_calls} зв. ({data.stats.ar_pct}%)
                </span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-hover overflow-hidden">
                <div
                  className={cn(
                    'h-full transition-all duration-500 rounded-full',
                    data.stats.ar_pct >= 65
                      ? 'bg-emerald-500'
                      : data.stats.ar_pct >= 40
                      ? 'bg-amber-500'
                      : 'bg-rose-500'
                  )}
                  style={{ width: `${Math.min(100, data.stats.ar_pct)}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-tertiary">
                <span>0% (Сплошной игнор)</span>
                <span>Целевой норматив: от 70%</span>
                <span>100% (Строго по регламенту)</span>
              </div>
            </Card>

            {/* 2. Cohort Efficiency Comparison */}
            <Card className="p-4 bg-surface border-subtle space-y-3">
              <span className="text-xs font-semibold uppercase text-secondary">
                2. Сравнение эффективности (Внутри одного периода)
              </span>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3.5 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    <Flame className="h-4 w-4" />
                    По скрипту ({data.stats.script_calls} зв.)
                  </div>
                  <div className="text-2xl font-black text-foreground">
                    {data.stats.swr_pct}%
                  </div>
                  <div className="text-[11px] text-tertiary">
                    {data.stats.script_wins} успешных этапов
                  </div>
                </div>

                <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-3.5 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400">
                    <Skull className="h-4 w-4" />
                    Отсебятина ({data.stats.freestyle_calls} зв.)
                  </div>
                  <div className="text-2xl font-black text-foreground">
                    {data.stats.fwr_pct}%
                  </div>
                  <div className="text-[11px] text-tertiary">
                    {data.stats.freestyle_wins} успешных этапов
                  </div>
                </div>
              </div>

              {/* Net Script Lift Bar */}
              <div className="flex items-center justify-between pt-2 border-t border-subtle">
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  <span className="text-xs font-medium text-foreground">
                    Чистый буст текста (Script Lift):
                  </span>
                </div>
                <span
                  className={cn(
                    'font-mono text-sm font-bold',
                    data.stats.script_lift_pct > 0
                      ? 'text-emerald-500'
                      : data.stats.script_lift_pct < 0
                      ? 'text-rose-500'
                      : 'text-tertiary'
                  )}
                >
                  {data.stats.script_lift_pct > 0 ? `+${data.stats.script_lift_pct}%` : `${data.stats.script_lift_pct}%`}
                </span>
              </div>
            </Card>

            {/* 3. Managers Breakdown (Saboteurs & Champions) */}
            <div className="space-y-3">
              <span className="text-xs font-semibold uppercase text-secondary">
                3. Соблюдение модуля менеджерами
              </span>
              <div className="space-y-2">
                {data.managers.map((mgr) => (
                  <div
                    key={mgr.name}
                    className="flex items-center justify-between rounded-lg border border-subtle bg-surface p-3 text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      {mgr.is_saboteur ? (
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/15 text-amber-500 text-[10px] font-bold">
                          ⚠️
                        </span>
                      ) : mgr.is_champion ? (
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500 text-[10px] font-bold">
                          👑
                        </span>
                      ) : (
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-hover text-tertiary text-[10px]">
                          •
                        </span>
                      )}
                      <div>
                        <div className="font-semibold text-foreground">{mgr.name}</div>
                        <div className="text-[11px] text-tertiary">
                          {mgr.script_calls} из {mgr.total_calls} зв. по стандарту • Конверсия этапа: {mgr.win_pct}%
                        </div>
                      </div>
                    </div>
                    <div className="text-right font-mono font-bold">
                      <span
                        className={cn(
                          mgr.is_saboteur
                            ? 'text-amber-500'
                            : mgr.is_champion
                            ? 'text-emerald-500'
                            : 'text-foreground'
                        )}
                      >
                        {mgr.ar_pct}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 4. Golden Quotes with Timestamps */}
            {data.golden_quotes && data.golden_quotes.length > 0 && (
              <div className="space-y-3">
                <span className="text-xs font-semibold uppercase text-secondary">
                  4. 🎧 Эталонные примеры (Клик для прослушивания)
                </span>
                <div className="space-y-2.5">
                  {data.golden_quotes.map((q, idx) => (
                    <div
                      key={q.call_id + idx}
                      className="rounded-lg border border-subtle bg-surface p-3 text-xs space-y-2 hover:border-primary/40 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-primary">{q.manager_name}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setPlayingQuoteIndex(playingQuoteIndex === idx ? null : idx);
                          }}
                          className={cn(
                            'h-7 px-2.5 gap-1.5 text-xs font-mono rounded-md',
                            playingQuoteIndex === idx
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-hover text-foreground hover:bg-active'
                          )}
                        >
                          {playingQuoteIndex === idx ? (
                            <>
                              <Volume2 className="h-3 w-3 animate-pulse" />
                              Играет: {formatTimestamp(q.timestamp_sec)}
                            </>
                          ) : (
                            <>
                              <Play className="h-3 w-3" />
                              {formatTimestamp(q.timestamp_sec)}
                            </>
                          )}
                        </Button>
                      </div>
                      <p className="text-foreground italic leading-relaxed">
                        «{q.quote}»
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Bottom Actions */}
            <div className="pt-4 border-t border-subtle flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyReport}
                className="gap-2 text-xs"
              >
                <Copy className="h-3.5 w-3.5" />
                {copied ? 'Отчет скопирован в буфер!' : 'Скопировать отчет для планерки'}
              </Button>
              <Button size="sm" onClick={onClose} className="text-xs">
                Готово
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default MethodologyXRayDrawer;

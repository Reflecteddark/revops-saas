/**
 * apps/web/src/components/methodology/MethodologyXRayDrawer.tsx
 *
 * One criterion in detail:
 * - how often the standard is said, and how the criterion went with it and without it
 * - the managers (a label only from 5 calls; a manager the CRM does not know is never labelled)
 * - real quotes of calls where the manager said the standard and the criterion passed, with the real recording
 * - a short report to copy for the planning meeting
 */

import * as React from 'react';
import { AlertTriangle, CheckCircle2, Clock, Copy, Flame, Skull, Sparkles, TrendingUp, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CallAudioPlayer } from '@/components/CallAudioPlayer';
import { cn } from '@/lib/utils';
import { apiClient } from '@/lib/api';
import type { MethodologyVerdict, XRayResponse } from '@/types/api';
import { VERDICT_BADGE, errorText, formatSecond } from './shared';

export interface MethodologyXRayDrawerProps {
  criterion: string | null;
  versionId?: string;
  tenantId?: string;
  isOpen: boolean;
  onClose: () => void;
}

const VERDICT_TEXT: Record<MethodologyVerdict, string> = {
  WORKING_STANDARD: 'Рабочий стандарт: его говорят, и с ним результат лучше',
  SABOTAGE_HIDDEN_GEM: 'Скрытый алмаз: по скрипту результат лучше, но его говорят не в каждом звонке',
  HYPOTHESIS_FAILED: 'Не сработало: скрипт говорят, а результат не лучше',
  FREESTYLE_STRONGER: 'Своими словами сильнее: стоит разобрать, что говорят лучшие',
  NO_SIGNAL: 'Явной разницы нет: по скрипту и своими словами результат близкий',
  COLLECTING_DATA: 'Сбор данных: звонков пока мало для вывода',
  NOT_SCRIPTED: 'Этот критерий считает код, речевого стандарта у него нет',
};

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

export function MethodologyXRayDrawer({ criterion, versionId, tenantId, isOpen, onClose }: MethodologyXRayDrawerProps) {
  const [data, setData] = React.useState<XRayResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!criterion || !isOpen) {
      setData(null);
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);
    apiClient.methodology
      .getXRay(criterion, versionId, tenantId)
      .then((res) => {
        if (alive) setData(res);
      })
      .catch((err) => {
        if (alive) setError(errorText(err, 'Не удалось загрузить данные рентгена'));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [criterion, versionId, tenantId, isOpen]);

  if (!isOpen || !criterion) return null;

  const handleCopyReport = () => {
    if (!data) return;
    const s = data.stats;
    const saboteurs = data.managers.filter((m) => m.is_saboteur).map((m) => `${m.name} (${m.ar_pct}% звонков по скрипту)`);
    const lines = [
      `📢 Рентген этапа ${data.criterion.toUpperCase()}: ${data.title}`,
      `Статус: ${VERDICT_TEXT[data.verdict] ?? data.verdict_label}`,
      `Звонков по критерию: ${s.total_calls}, по скрипту говорят в ${s.ar_pct}% звонков`,
    ];
    if (s.script_calls > 0 && s.freestyle_calls > 0) {
      lines.push(`Критерий пройден: по скрипту ${s.swr_pct}%, своими словами ${s.fwr_pct}% (разница ${signed(s.script_lift_pct)} п.п.)`);
    }
    if (!s.enough_data) lines.push(`Данных пока мало: нужно ещё ${s.calls_needed} звонков для вывода`);
    if (saboteurs.length) lines.push(`⚠️ Реже всего говорят по скрипту: ${saboteurs.join(', ')}`);
    void navigator.clipboard?.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const verdictIcon =
    data?.verdict === 'WORKING_STANDARD' ? <CheckCircle2 className="h-4 w-4" />
    : data?.verdict === 'SABOTAGE_HIDDEN_GEM' ? <AlertTriangle className="h-4 w-4" />
    : data?.verdict === 'HYPOTHESIS_FAILED' ? <Skull className="h-4 w-4" />
    : data?.verdict === 'FREESTYLE_STRONGER' ? <Sparkles className="h-4 w-4" />
    : <Clock className="h-4 w-4" />;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm transition-opacity" data-testid="methodology-xray-drawer">
      <div className="relative flex h-full w-full max-w-2xl flex-col bg-background p-6 shadow-2xl border-l border-subtle overflow-y-auto">
        <div className="flex items-start justify-between border-b border-subtle pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-primary">{criterion.toUpperCase()}</span>
              <span className="text-xs text-muted-foreground">• {data?.stage || 'Рентген этапа'}</span>
            </div>
            <h2 className="text-xl font-bold tracking-tight text-foreground mt-1">{data?.title || `Анализ критерия ${criterion.toUpperCase()}`}</h2>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0 rounded-full hover:bg-hover" data-testid="close-xray-drawer" aria-label="Закрыть">
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
          <div role="alert" className="py-12 text-center text-sm text-destructive">{error}</div>
        ) : data ? (
          <div className="space-y-6 py-6">
            <div>
              <Badge className={cn('gap-1.5 px-3 py-1', VERDICT_BADGE[data.verdict])}>
                {verdictIcon}
                {VERDICT_TEXT[data.verdict] ?? data.verdict_label}
              </Badge>
              {!data.stats.enough_data && data.verdict !== 'NOT_SCRIPTED' && (
                <p className="mt-2 text-[11px] text-tertiary" data-testid="xray-needs-data">
                  Звонков по критерию: {data.stats.total_calls}. Для вывода нужно 30, и не меньше 5 в каждой группе (говорят по скрипту / своими словами).
                </p>
              )}
            </div>

            <Card className="p-4 bg-surface border-subtle space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase text-secondary">1. Говорят по скрипту</span>
                <span className="text-xs font-mono font-medium text-foreground">
                  {data.stats.script_calls} из {data.stats.total_calls} зв. ({data.stats.ar_pct}%)
                </span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-hover overflow-hidden">
                <div className={cn('h-full transition-all duration-500 rounded-full', data.stats.ar_pct >= 65 ? 'bg-emerald-500' : data.stats.ar_pct >= 40 ? 'bg-amber-500' : 'bg-rose-500')} style={{ width: `${Math.min(100, data.stats.ar_pct)}%` }} />
              </div>
              <div className="flex justify-between text-[11px] text-tertiary">
                <span>0%</span>
                <span>Принят отделом: от 65%</span>
                <span>100%</span>
              </div>
            </Card>

            <Card className="p-4 bg-surface border-subtle space-y-3">
              <span className="text-xs font-semibold uppercase text-secondary">2. Критерий пройден: со скриптом и без него</span>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3.5 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    <Flame className="h-4 w-4" />
                    По скрипту ({data.stats.script_calls} зв.)
                  </div>
                  <div className="text-2xl font-black text-foreground">{data.stats.script_calls ? `${data.stats.swr_pct}%` : '—'}</div>
                  <div className="text-[11px] text-tertiary">пройден в {data.stats.script_wins} звонках</div>
                </div>
                <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-3.5 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400">
                    <Skull className="h-4 w-4" />
                    Своими словами ({data.stats.freestyle_calls} зв.)
                  </div>
                  <div className="text-2xl font-black text-foreground">{data.stats.freestyle_calls ? `${data.stats.fwr_pct}%` : '—'}</div>
                  <div className="text-[11px] text-tertiary">пройден в {data.stats.freestyle_wins} звонках</div>
                </div>
              </div>
              {data.stats.script_calls > 0 && data.stats.freestyle_calls > 0 && (
                <div className="flex items-center justify-between pt-2 border-t border-subtle">
                  <div className="flex items-center gap-1.5">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    <span className="text-xs font-medium text-foreground">Разница:</span>
                  </div>
                  <span className={cn('font-mono text-sm font-bold', data.stats.script_lift_pct > 0 ? 'text-emerald-500' : data.stats.script_lift_pct < 0 ? 'text-rose-500' : 'text-tertiary')}>
                    {signed(data.stats.script_lift_pct)} п.п.
                  </span>
                </div>
              )}
            </Card>

            <div className="space-y-3">
              <span className="text-xs font-semibold uppercase text-secondary">3. Менеджеры</span>
              {data.managers.length === 0 ? (
                <p className="text-xs text-tertiary">Оценённых звонков по этому критерию пока нет.</p>
              ) : (
                <div className="space-y-2">
                  {data.managers.map((mgr) => (
                    <div key={mgr.name} className="flex items-center justify-between rounded-lg border border-subtle bg-surface p-3 text-xs">
                      <div className="flex items-center gap-2.5">
                        <span className={cn('flex h-5 w-5 items-center justify-center rounded-full text-[10px]', mgr.is_saboteur ? 'bg-amber-500/15 text-amber-500' : mgr.is_champion ? 'bg-emerald-500/15 text-emerald-500' : 'bg-hover text-tertiary')}>
                          {mgr.is_saboteur ? '⚠️' : mgr.is_champion ? '👑' : '•'}
                        </span>
                        <div>
                          <div className="font-semibold text-foreground">
                            {mgr.name}
                            {mgr.is_saboteur && <span className="ml-1.5 font-normal text-amber-500">говорит по скрипту редко</span>}
                            {mgr.is_champion && <span className="ml-1.5 font-normal text-emerald-500">образец</span>}
                          </div>
                          <div className="text-[11px] text-tertiary">
                            {mgr.script_calls} из {mgr.total_calls} зв. по скрипту • критерий пройден в {mgr.win_pct}%
                          </div>
                        </div>
                      </div>
                      <div className="text-right font-mono font-bold text-foreground">{mgr.ar_pct}%</div>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-tertiary">Метка ставится от 5 звонков; менеджер, которого нет в CRM, меткой не отмечается.</p>
            </div>

            <div className="space-y-3">
              <span className="text-xs font-semibold uppercase text-secondary">4. Как это звучало в настоящих звонках</span>
              {data.golden_quotes.length === 0 ? (
                <p className="text-xs text-tertiary" data-testid="xray-no-quotes">
                  Примеров пока нет: они появятся, когда будут звонки, где менеджер сказал по скрипту и критерий пройден.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {data.golden_quotes.map((q) => (
                    <div key={`${q.call_id}`} className="rounded-lg border border-subtle bg-surface p-3 text-xs space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-tertiary">
                        <span className="font-semibold text-primary">{q.manager_name}</span>
                        <span className="font-mono">
                          {q.call_date ? new Date(q.call_date).toLocaleDateString('ru-RU') : ''}
                          {q.timestamp_sec !== null && ` • на ${formatSecond(q.timestamp_sec)}`}
                        </span>
                      </div>
                      <p className="text-foreground italic leading-relaxed">«{q.quote}»</p>
                      <CallAudioPlayer callId={q.call_id} hasAudio={q.has_audio} testId={`xray-audio-${q.call_id}`} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-subtle flex items-center justify-between">
              <Button variant="outline" size="sm" onClick={handleCopyReport} className="gap-2 text-xs">
                <Copy className="h-3.5 w-3.5" />
                {copied ? 'Отчёт скопирован' : 'Скопировать отчёт для планерки'}
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

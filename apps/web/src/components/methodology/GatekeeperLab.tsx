/**
 * apps/web/src/components/methodology/GatekeeperLab.tsx
 *
 * Gatekeeper & Secretary Bypass Lab (cr6 deep-dive):
 * - Pass Rate % and total attempts
 * - Winning Hooks Extraction (exact manager speech that passed to DM)
 * - Killer Anti-Patterns (phrases leading to secretary block)
 */

import * as React from 'react';
import {
  Award,
  CheckCircle2,
  DoorOpen,
  Play,
  ShieldAlert,
  Sparkles,
  Volume2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { apiClient } from '@/lib/api';
import type { GatekeeperLabResponse } from '@/types/api';

export interface GatekeeperLabProps {
  versionId?: string;
  tenantId?: string;
}

export function GatekeeperLab({ versionId, tenantId }: GatekeeperLabProps) {
  const [data, setData] = React.useState<GatekeeperLabResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [playingIndex, setPlayingIndex] = React.useState<number | null>(null);

  React.useEffect(() => {
    let isMounted = true;
    setLoading(true);

    apiClient.methodology
      .getGatekeeperLab(versionId, tenantId)
      .then((res) => {
        if (isMounted) setData(res);
      })
      .catch((err) => {
        console.error('Failed to load gatekeeper lab telemetry:', err);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [versionId, tenantId]);

  const formatTimestamp = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6" data-testid="gatekeeper-lab">
      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <Card className="p-4 bg-surface border-subtle space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-secondary uppercase">
            <DoorOpen className="h-4 w-4 text-primary" />
            Контактов с секретарем
          </div>
          <div className="text-3xl font-black text-foreground">
            {loading ? <Skeleton className="h-8 w-16" /> : data?.total_attempts || 0}
          </div>
          <div className="text-[11px] text-tertiary">Звонков на общих номерах компаний</div>
        </Card>

        <Card className="p-4 bg-surface border-subtle space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-secondary uppercase">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            Выход на ЛПР (Pass Rate)
          </div>
          <div className="text-3xl font-black text-emerald-500 font-mono">
            {loading ? <Skeleton className="h-8 w-16" /> : `${data?.pass_rate_pct || 0}%`}
          </div>
          <div className="text-[11px] text-tertiary">
            {data?.bypassed_count || 0} звонков переведены на руководство
          </div>
        </Card>

        <Card className="p-4 bg-surface border-subtle space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-secondary uppercase">
            <Sparkles className="h-4 w-4 text-amber-500" />
            Паттернов успеха
          </div>
          <div className="text-3xl font-black text-foreground">
            {loading ? <Skeleton className="h-8 w-16" /> : data?.winning_hooks?.length || 0}
          </div>
          <div className="text-[11px] text-tertiary">Выявлено ИИ в победных звонках</div>
        </Card>
      </div>

      {/* Two-column layout: Winning Hooks vs Killer Anti-Patterns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: 🏆 Winning Hooks */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Award className="h-4 w-4 text-emerald-500" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">
                Фразы-Чемпионы (Паттерны обхода)
              </h3>
            </div>
            <span className="text-xs text-tertiary">Высокая проходимость</span>
          </div>

          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-28 w-full rounded-lg" />
              <Skeleton className="h-28 w-full rounded-lg" />
            </div>
          ) : (
            <div className="space-y-3">
              {data?.winning_hooks?.map((hook, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-2.5 transition-all hover:border-emerald-500/40"
                >
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-[10px] px-2 py-0.5">
                      {hook.hook_category}
                    </Badge>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-emerald-500">
                        {hook.success_rate_pct}% успеха
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPlayingIndex(playingIndex === idx ? null : idx)}
                        className={cn(
                          'h-6 px-2 gap-1 text-[11px] font-mono rounded',
                          playingIndex === idx
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-hover text-foreground'
                        )}
                      >
                        {playingIndex === idx ? (
                          <>
                            <Volume2 className="h-3 w-3 animate-pulse" />
                            {formatTimestamp(hook.timestamp_sec)}
                          </>
                        ) : (
                          <>
                            <Play className="h-3 w-3" />
                            {formatTimestamp(hook.timestamp_sec)}
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  <p className="text-sm font-medium text-foreground leading-relaxed italic">
                    «{hook.phrase}»
                  </p>

                  <div className="text-[11px] text-tertiary">
                    Применено {hook.uses_count} раз за период
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: 💀 Killer Anti-Patterns */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-rose-500" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">
                Фразы-Убийцы (Анти-паттерны)
              </h3>
            </div>
            <span className="text-xs text-rose-500 font-medium">Сливают на info@</span>
          </div>

          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-28 w-full rounded-lg" />
              <Skeleton className="h-28 w-full rounded-lg" />
            </div>
          ) : (
            <div className="space-y-3">
              {data?.banned_killer_phrases?.map((killer, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 space-y-2.5 transition-all hover:border-rose-500/40"
                >
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="border-rose-500/30 text-rose-600 dark:text-rose-400 text-[10px] px-2 py-0.5">
                      Табу-маркер
                    </Badge>
                    <span className="text-xs font-mono font-bold text-rose-500">
                      {killer.drop_rate_pct}% отказов
                    </span>
                  </div>

                  <p className="text-sm font-medium text-foreground leading-relaxed line-through decoration-rose-500">
                    «{killer.phrase}»
                  </p>

                  <div className="text-xs text-rose-600/90 dark:text-rose-400/90 leading-tight">
                    💡 <strong>Почему не работает:</strong> {killer.reason}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default GatekeeperLab;

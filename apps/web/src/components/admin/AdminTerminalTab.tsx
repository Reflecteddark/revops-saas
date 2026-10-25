/**
 * apps/web/src/components/admin/AdminTerminalTab.tsx
 *
 * Live Execution Console & Log Stream Tab.
 * - Monospace dark terminal streaming live logs from backend buffer.
 * - Level filters: All, Error, Calls/Webhooks.
 * - Auto-refresh toggle (every 3s) & console clear.
 */

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Terminal, Trash2 } from 'lucide-react';
import { adminApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import type { AdminLogEntry, AdminLogsResponse } from '@/types/api';

export function AdminTerminalTab() {
  const queryClient = useQueryClient();
  const [logFilter, setLogFilter] = React.useState<'all' | 'error' | 'calls'>('all');
  const [autoRefreshLogs, setAutoRefreshLogs] = React.useState(true);
  const terminalBottomRef = React.useRef<HTMLDivElement>(null);

  const {
    data: logsData,
    isLoading: isLogsLoading,
    refetch: refetchLogs,
  } = useQuery<AdminLogsResponse>({
    queryKey: ['admin-logs', logFilter],
    queryFn: () => adminApi.getLogs('console', logFilter),
    refetchInterval: autoRefreshLogs ? 3000 : false,
  });

  const clearLogsMutation = useMutation({
    mutationFn: () => adminApi.clearLogs(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-logs'] });
    },
  });

  const logs = logsData?.logs ?? [];

  return (
    <div className="space-y-4" data-testid="admin-terminal-tab">
      <div className="rounded-xl border border-subtle bg-surface overflow-hidden shadow-sm" data-testid="live-terminal">
        {/* Terminal Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-subtle px-4 py-3 bg-subtle/40">
          <div className="flex items-center gap-3">
            {/* Terminal Window Dots */}
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded-full bg-rose-500/80" />
              <div className="h-3 w-3 rounded-full bg-amber-500/80" />
              <div className="h-3 w-3 rounded-full bg-emerald-500/80" />
            </div>
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-tertiary" />
              <span className="font-mono text-xs font-semibold text-foreground">
                Live Console & Log Stream
              </span>
              <span className="rounded bg-subtle px-1.5 py-0.2 font-mono text-[10px] text-tertiary">
                {logs.length} записей
              </span>
            </div>
          </div>

          {/* Filter Pills & Control Buttons */}
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-lg border border-subtle bg-subtle/50 p-0.5 text-xs">
              <button
                onClick={() => setLogFilter('all')}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  logFilter === 'all'
                    ? 'bg-active text-foreground font-semibold'
                    : 'text-secondary hover:text-foreground'
                }`}
              >
                Все
              </button>
              <button
                onClick={() => setLogFilter('error')}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  logFilter === 'error'
                    ? 'bg-active text-rose-400 font-semibold'
                    : 'text-secondary hover:text-foreground'
                }`}
              >
                Ошибки
              </button>
              <button
                onClick={() => setLogFilter('calls')}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  logFilter === 'calls'
                    ? 'bg-active text-cyan-400 font-semibold'
                    : 'text-secondary hover:text-foreground'
                }`}
              >
                Звонки / Вебхуки
              </button>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAutoRefreshLogs(!autoRefreshLogs)}
              className={`h-7 text-xs border border-subtle ${
                autoRefreshLogs ? 'text-emerald-400 bg-emerald-500/10' : 'text-secondary'
              }`}
              title="Переключить автообновление каждые 3 секунды"
            >
              <RefreshCw className={`h-3 w-3 mr-1 ${autoRefreshLogs ? 'animate-spin' : ''}`} />
              <span>{autoRefreshLogs ? 'Авто 3с' : 'Пауза'}</span>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetchLogs()}
              className="h-7 text-xs border border-subtle text-secondary hover:text-foreground"
              title="Обновить логи вручную"
            >
              <RefreshCw className="h-3 w-3" />
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => clearLogsMutation.mutate()}
              disabled={clearLogsMutation.isPending}
              className="h-7 text-xs border border-subtle text-secondary hover:text-rose-400 hover:border-rose-500/40"
              title="Очистить буфер консоли"
              data-testid="btn-clear-logs"
            >
              <Trash2 className="h-3 w-3 mr-1" />
              <span>Очистить</span>
            </Button>
          </div>
        </div>

        {/* Terminal Monospace Body */}
        <div className="h-96 overflow-y-auto bg-black/90 p-4 font-mono text-xs space-y-1.5 selection:bg-primary/30">
          {isLogsLoading && logs.length === 0 ? (
            <div className="flex h-full items-center justify-center text-zinc-500">
              <RefreshCw className="h-4 w-4 animate-spin mr-2" />
              <span>Подключение к потоку логов ядра...</span>
            </div>
          ) : logs.length > 0 ? (
            logs.map((log: AdminLogEntry, i: number) => {
              const level = (log.level || 'info').toLowerCase();
              const isError = level === 'error' || log.msg.toLowerCase().includes('ошибк');
              const isWarn = level === 'warn';
              const isSuccess = level === 'success' || log.msg.toLowerCase().includes('успеш');

              const levelColor = isError
                ? 'text-rose-400 bg-rose-500/20'
                : isWarn
                ? 'text-amber-400 bg-amber-500/20'
                : isSuccess
                ? 'text-emerald-400 bg-emerald-500/20'
                : 'text-zinc-400 bg-zinc-800';

              return (
                <div key={i} className="flex items-start gap-2 leading-relaxed hover:bg-zinc-900/60 rounded px-1.5 py-0.5">
                  <span className="text-zinc-600 shrink-0 select-none">
                    [{log.ts || new Date().toLocaleTimeString('ru-RU')}]
                  </span>
                  <span className={`px-1.5 py-0.2 rounded text-[10px] font-semibold shrink-0 uppercase tracking-wide ${levelColor}`}>
                    {log.level || 'INFO'}
                  </span>
                  {log.service && (
                    <span className="text-zinc-500 shrink-0 font-medium">
                      [{log.service}]
                    </span>
                  )}
                  <span
                    className={
                      isError
                        ? 'text-rose-300'
                        : isWarn
                        ? 'text-amber-300'
                        : isSuccess
                        ? 'text-emerald-300'
                        : 'text-zinc-300'
                    }
                  >
                    {log.msg}
                  </span>
                </div>
              );
            })
          ) : (
            <div className="flex h-full items-center justify-center text-zinc-600">
              <span>Буфер пуст. Записи логов отсутствуют.</span>
            </div>
          )}
          <div ref={terminalBottomRef} />
        </div>
      </div>
    </div>
  );
}

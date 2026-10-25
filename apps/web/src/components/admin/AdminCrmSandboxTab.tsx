/**
 * apps/web/src/components/admin/AdminCrmSandboxTab.tsx
 *
 * CRM Integrations & Inbound Webhook Call Sandbox.
 * - amoCRM API v4 vs Bitrix24 REST connectors with 1-click switcher.
 * - CRM token validation and deal dry-run test.
 * - Call simulator (Sandbox) to emulate incoming CRM calls with SSOT scoring.
 * - Live Raw Webhook Inspector (real JSON payload inspection).
 * - Quarantine triage & re-run audit.
 */

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  Clock,
  DollarSign,
  Headphones,
  PhoneCall,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldAlert,
  Zap,
} from 'lucide-react';
import { adminApi } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type {
  CrmActionPayload,
  CrmStatusResponse,
  QuarantineCallsResponse,
  SimulateCallPayload,
} from '@/types/api';

export function AdminCrmSandboxTab() {
  const queryClient = useQueryClient();
  const [selectedTenantId, setSelectedTenantId] = React.useState('TNT-001');
  const [actionAlert, setActionAlert] = React.useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Simulator Form State
  const [managerName, setManagerName] = React.useState('Дмитрий Федотов');
  const [clientPhone, setClientPhone] = React.useState('+7 (999) 123-45-67');
  const [durationSec, setDurationSec] = React.useState('145');
  const [simulateLeak, setSimulateLeak] = React.useState(false);

  // 1. CRM Status Query
  const { data: crmData } = useQuery<CrmStatusResponse>({
    queryKey: ['admin-crm-status', selectedTenantId],
    queryFn: () => adminApi.getCrmStatus(selectedTenantId),
    refetchInterval: 15000,
  });

  // 2. Last Incoming Webhook Query
  const { data: lastWebhook, isLoading: isWebhookLoading, refetch: refetchWebhook } = useQuery({
    queryKey: ['admin-last-webhook'],
    queryFn: adminApi.getLastIncomingWebhook,
    refetchInterval: 10000,
  });

  // 3. Quarantine Calls Query
  const { data: quarantineData, refetch: refetchQuarantine } = useQuery<QuarantineCallsResponse>({
    queryKey: ['admin-quarantine-calls'],
    queryFn: adminApi.getQuarantineCalls,
    refetchInterval: 15000,
  });

  // 4. Mutations
  const crmActionMutation = useMutation({
    mutationFn: (payload: CrmActionPayload) => adminApi.crmAction(payload),
    onSuccess: (res) => {
      setActionAlert({
        text: res.message || (res.output ? `Команда выполнена: ${res.output.slice(0, 80)}...` : 'Действие выполнено'),
        type: 'success',
      });
      queryClient.invalidateQueries({ queryKey: ['admin-crm-status'] });
      queryClient.invalidateQueries({ queryKey: ['admin-logs'] });
    },
    onError: (err: Error) => {
      setActionAlert({ text: `Ошибка CRM: ${err.message}`, type: 'error' });
    },
  });

  const simulateCallMutation = useMutation({
    mutationFn: (payload: SimulateCallPayload) => adminApi.simulateCall(payload),
    onSuccess: (res) => {
      setActionAlert({
        text: `Звонок успешно эмулирован! ID: ${res.call_id ?? 'sim_call'}. Запись добавлена в Google Таблицу и транслирована в WebSocket.`,
        type: 'success',
      });
      queryClient.invalidateQueries({ queryKey: ['admin-last-webhook'] });
      queryClient.invalidateQueries({ queryKey: ['admin-logs'] });
    },
    onError: (err: Error) => {
      setActionAlert({ text: `Ошибка симуляции: ${err.message}`, type: 'error' });
    },
  });

  const resolveQuarantineMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) => adminApi.resolveQuarantineCall(id, action),
    onSuccess: (res) => {
      setActionAlert({ text: res.message || 'Звонок успешно возвращён из карантина!', type: 'success' });
      queryClient.invalidateQueries({ queryKey: ['admin-quarantine-calls'] });
    },
    onError: (err: Error) => {
      setActionAlert({ text: `Ошибка карантина: ${err.message}`, type: 'error' });
    },
  });

  const handleSimulateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    simulateCallMutation.mutate({
      tenant_id: selectedTenantId,
      provider: crmData?.active_crm || 'amocrm',
      manager_name: managerName.trim(),
      client_phone: clientPhone.trim(),
      duration_sec: Number(durationSec) || 145,
      simulate_leak: simulateLeak,
    });
  };

  const activeCrm = crmData?.active_crm || 'bitrix24';

  return (
    <div className="space-y-6" data-testid="admin-crm-sandbox-tab">
      {/* Action Notification Alert */}
      {actionAlert && (
        <Alert
          className={
            actionAlert.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
          }
        >
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              {actionAlert.type === 'success' ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-rose-400" />
              )}
              <AlertDescription className="text-xs font-medium">{actionAlert.text}</AlertDescription>
            </div>
            <button onClick={() => setActionAlert(null)} className="text-xs opacity-60 hover:opacity-100">
              ✕
            </button>
          </div>
        </Alert>
      )}

      {/* 1. Header KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-subtle bg-surface p-3 space-y-1">
          <div className="flex items-center justify-between text-tertiary">
            <span className="text-[11px] font-medium uppercase tracking-wider">Звонков сегодня</span>
            <PhoneCall className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="text-lg font-bold font-mono text-foreground">14</div>
          <div className="text-[10px] text-emerald-400 font-medium">Аудит 13 критериев SSOT</div>
        </div>

        <div className="rounded-xl border border-subtle bg-surface p-3 space-y-1">
          <div className="flex items-center justify-between text-tertiary">
            <span className="text-[11px] font-medium uppercase tracking-wider">Минут аудио</span>
            <Clock className="h-3.5 w-3.5 text-cyan-400" />
          </div>
          <div className="text-lg font-bold font-mono text-foreground">28 мин</div>
          <div className="text-[10px] text-tertiary">RevOps Speech AI Core</div>
        </div>

        <div className="rounded-xl border border-subtle bg-surface p-3 space-y-1">
          <div className="flex items-center justify-between text-termp">
            <span className="text-[11px] font-medium uppercase tracking-wider">Скорость аудита</span>
            <Zap className="h-3.5 w-3.5 text-amber-400" />
          </div>
          <div className="text-lg font-bold font-mono text-foreground">~7.4 сек</div>
          <div className="text-[10px] text-secondary">Среднее время звонка</div>
        </div>

        <div className="rounded-xl border border-subtle bg-surface p-3 space-y-1">
          <div className="flex items-center justify-between text-tertiary">
            <span className="text-[11px] font-medium uppercase tracking-wider">Расходы Gemini</span>
            <DollarSign className="h-3.5 w-3.5 text-emerald-400" />
          </div>
          <div className="text-lg font-bold font-mono text-foreground">$0.0336</div>
          <div className="text-[10px] text-emerald-400 font-medium">~3.29 ₽ (Оптимально)</div>
        </div>
      </div>

      {/* 2. CRM Contour Switcher & Status Cards */}
      <Card className="border-subtle bg-surface">
        <CardHeader className="pb-3">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm font-bold text-foreground">
                  Интеграция с CRM: Bitrix24 REST API & amoCRM API v4
                </CardTitle>
                <Badge
                  variant="outline"
                  className={
                    activeCrm === 'bitrix24'
                      ? 'border-blue-500/30 bg-blue-500/10 text-blue-400 font-mono text-xs'
                      : 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400 font-mono text-xs'
                  }
                >
                  Активен: {activeCrm === 'bitrix24' ? 'Bitrix24 REST' : 'amoCRM API v4'}
                </Badge>
              </div>
              <CardDescription className="text-xs">
                Двухконтурный коннектор для автоматической выгрузки сделок, воронок и аудиозаписей звонков
              </CardDescription>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-secondary">Тенант:</span>
              <select
                value={selectedTenantId}
                onChange={(e) => setSelectedTenantId(e.target.value)}
                className="h-8 rounded-md border border-subtle bg-subtle/50 px-2.5 font-mono text-xs text-foreground focus:outline-none"
              >
                <option value="TNT-001">TNT-001 (Самозанятый)</option>
                <option value="TNT-TEST-002">TNT-TEST-002 (Test)</option>
              </select>

              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  crmActionMutation.mutate({
                    action: 'switch_crm',
                    tenant_id: selectedTenantId,
                    crm_type: activeCrm === 'bitrix24' ? 'amocrm' : 'bitrix24',
                  })
                }
                disabled={crmActionMutation.isPending}
                className="h-8 gap-1.5 text-xs border-subtle bg-surface hover:bg-hover"
                data-testid="btn-switch-crm"
              >
                <ArrowRightLeft className="h-3.5 w-3.5 text-primary" />
                <span>Переключить на {activeCrm === 'bitrix24' ? 'amoCRM' : 'Bitrix24'}</span>
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Card 1: Bitrix24 REST API */}
            <div
              className={`rounded-xl border p-4 transition-all ${
                activeCrm === 'bitrix24'
                  ? 'border-blue-500/40 bg-blue-500/5'
                  : 'border-subtle bg-subtle/30 opacity-70'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-blue-400" />
                  <span className="font-semibold text-xs text-foreground">Bitrix24 REST API</span>
                </div>
                <Badge variant="outline" className="text-[10px] border-subtle">
                  Webhook Ingress
                </Badge>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between text-secondary">
                  <span>Статус подключения:</span>
                  <span className="font-medium text-foreground">
                    {crmData?.bitrix24?.status_text || 'Демо-контур (REST 401)'}
                  </span>
                </div>
                <div className="space-y-1">
                  <span className="text-[11px] text-tertiary">Входящий вебхук REST:</span>
                  <div className="font-mono text-[11px] text-secondary bg-subtle p-1.5 rounded truncate">
                    {crmData?.bitrix24?.webhook_url || 'https://company.bitrix24.ru/rest/1/...'}
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      crmActionMutation.mutate({
                        action: 'show_stages',
                        tenant_id: selectedTenantId,
                        crm_type: 'bitrix24',
                      })
                    }
                    disabled={crmActionMutation.isPending}
                    className="h-7 text-xs border-subtle"
                    data-testid="btn-test-b24"
                  >
                    Тест подключения
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      crmActionMutation.mutate({
                        action: 'dry_run',
                        tenant_id: selectedTenantId,
                        crm_type: 'bitrix24',
                      })
                    }
                    disabled={crmActionMutation.isPending}
                    className="h-7 text-xs text-secondary hover:text-foreground"
                  >
                    Тест сделки (Dry Run)
                  </Button>
                </div>
              </div>
            </div>

            {/* Card 2: amoCRM API v4 */}
            <div
              className={`rounded-xl border p-4 transition-all ${
                activeCrm === 'amocrm'
                  ? 'border-cyan-500/40 bg-cyan-500/5'
                  : 'border-subtle bg-subtle/30 opacity-70'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-cyan-400" />
                  <span className="font-semibold text-xs text-foreground">amoCRM API v4</span>
                </div>
                <Badge variant="outline" className="text-[10px] border-subtle">
                  Polling & Events
                </Badge>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between text-secondary">
                  <span>Статус подключения:</span>
                  <span className="font-medium text-emerald-400">
                    {crmData?.amocrm?.status_text || 'Готов ✓ (OAuth 2.0)'}
                  </span>
                </div>
                <div className="space-y-1">
                  <span className="text-[11px] text-tertiary">Домен amoCRM:</span>
                  <div className="font-mono text-[11px] text-secondary bg-subtle p-1.5 rounded truncate">
                    {crmData?.amocrm?.domain || 'company.amocrm.ru'}
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      crmActionMutation.mutate({
                        action: 'show_stages',
                        tenant_id: selectedTenantId,
                        crm_type: 'amocrm',
                      })
                    }
                    disabled={crmActionMutation.isPending}
                    className="h-7 text-xs border-subtle text-cyan-400"
                    data-testid="btn-test-amocrm"
                  >
                    Проверить токен
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      crmActionMutation.mutate({
                        action: 'dry_run',
                        tenant_id: selectedTenantId,
                        crm_type: 'amocrm',
                      })
                    }
                    disabled={crmActionMutation.isPending}
                    className="h-7 text-xs text-secondary hover:text-foreground"
                  >
                    Тест сделки (Dry Run)
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 3. Call Sandbox (Simulator) & Raw Webhook Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: Call Simulator Form */}
        <Card className="border-subtle bg-surface">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Headphones className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm font-bold text-foreground">
                Песочница звонков CRM (Call Simulator)
              </CardTitle>
            </div>
            <CardDescription className="text-xs">
              Эмулирует входящий звонок из amoCRM или Битрикс24, прогоняет через Gemini и пишет в воронку.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSimulateSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-secondary">Менеджер ОП</label>
                  <Input
                    value={managerName}
                    onChange={(e) => setManagerName(e.target.value)}
                    className="h-8 text-xs bg-subtle/50 border-subtle"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-secondary">Телефон клиента</label>
                  <Input
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                    className="h-8 text-xs font-mono bg-subtle/50 border-subtle"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-secondary">Длительность (сек)</label>
                  <Input
                    type="number"
                    value={durationSec}
                    onChange={(e) => setDurationSec(e.target.value)}
                    className="h-8 text-xs font-mono bg-subtle/50 border-subtle"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-secondary">Сценарий разговора</label>
                  <select
                    value={simulateLeak ? 'leak' : 'won'}
                    onChange={(e) => setSimulateLeak(e.target.value === 'leak')}
                    className="h-8 w-full rounded-md border border-subtle bg-subtle/50 px-2 text-xs text-foreground focus:outline-none"
                  >
                    <option value="won">🟢 Эталон (Балл 11/13, Next Step есть)</option>
                    <option value="leak">🔴 Слив (Балл 6/13, Нет Next Step)</option>
                  </select>
                </div>
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  disabled={simulateCallMutation.isPending}
                  className="h-8 w-full gap-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
                  data-testid="btn-simulate-call"
                >
                  <Send className={`h-3.5 w-3.5 ${simulateCallMutation.isPending ? 'animate-spin' : ''}`} />
                  <span>
                    {simulateCallMutation.isPending ? 'Эмуляция и аудит звонка...' : 'Отправить тестовый звонок в CRM'}
                  </span>
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Right: Raw Webhook Inspector */}
        <Card className="border-subtle bg-surface flex flex-col justify-between">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-cyan-400" />
                <CardTitle className="text-sm font-bold text-foreground">
                  Инспектор последнего вебхука
                </CardTitle>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => refetchWebhook()}
                className="h-7 text-[11px] text-secondary hover:text-foreground"
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Обновить
              </Button>
            </div>
            <CardDescription className="text-xs">
              Сырой JSON-payload, присланный CRM при завершении звонка
            </CardDescription>
          </CardHeader>

          <CardContent>
            <div className="h-48 rounded-lg border border-subtle bg-black/90 p-3 font-mono text-[11px] text-emerald-400 overflow-y-auto">
              {isWebhookLoading ? (
                <div className="text-zinc-500">Загрузка вебхука...</div>
              ) : lastWebhook ? (
                <pre>{JSON.stringify(lastWebhook, null, 2)}</pre>
              ) : (
                <div className="text-zinc-600">Входящих вебхуков пока не зафиксировано.</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 4. Call Quarantine Triage */}
      {quarantineData && quarantineData.calls && quarantineData.calls.length > 0 && (
        <Card className="border-subtle bg-surface">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-amber-400" />
                <CardTitle className="text-sm font-bold text-foreground">
                  Карантин звонков (Quarantine Triage)
                </CardTitle>
                <Badge variant="outline" className="border-amber-500/30 text-amber-400 text-xs font-mono">
                  {quarantineData.in_quarantine_count} в карантине
                </Badge>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => refetchQuarantine()}
                className="h-7 text-xs text-secondary hover:text-foreground"
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Обновить
              </Button>
            </div>
            <CardDescription className="text-xs">
              Звонки с ошибками скачивания аудио или автоответчиками, изолированные для повторной проверки
            </CardDescription>
          </CardHeader>

          <CardContent>
            <div className="space-y-2">
              {quarantineData.calls.slice(0, 5).map((call) => (
                <div
                  key={call.id}
                  className="flex items-center justify-between rounded-lg border border-subtle bg-subtle/50 p-2.5 text-xs"
                >
                  <div className="space-y-0.5">
                    <div className="font-semibold text-foreground font-mono">
                      {call.id} • {call.manager || 'Менеджер'}
                    </div>
                    <div className="text-[11px] text-secondary">
                      Причина: {call.reason || call.quarantine_reason || 'Аудио оборвалось'}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => resolveQuarantineMutation.mutate({ id: call.id, action: 'approve' })}
                      className="h-7 text-xs border-subtle text-emerald-400"
                    >
                      <RotateCcw className="h-3 w-3 mr-1" />
                      Повторить аудит
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

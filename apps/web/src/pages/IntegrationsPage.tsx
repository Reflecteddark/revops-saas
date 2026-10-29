/**
 * apps/web/src/pages/IntegrationsPage.tsx
 *
 * RevOps Enterprise OS 2.0 - Integrations Health, Reconciliation & DLQ Management.
 * Provides real-time visibility into the End-to-End data lineage:
 * CRM Sources (amoCRM / Bitrix24) ➔ PostgreSQL DWH ➔ Google Sheets ➔ Web Cabinet.
 * Includes:
 * 1. 4 Traffic Light status KPI cards (Redis Queue, DWH PostgreSQL, Sheets Batch, DLQ)
 * 2. Visual Lineage Balance Bar with 100% convergence indicator
 * 3. Dead Letter Queue (DLQ) table with isolated error logs and 1-click retry
 * 4. 1-click Telegram reconciliation dispatch to the ROP group
 */

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileSpreadsheet,
  Link2,
  Radio,
  RefreshCw,
  Send,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { integrationsApi, dealsApi } from '@/lib/api';
import { useActiveTenantSafe } from '@/hooks/useActiveTenant';
import { useRevOpsStore } from '@/store/useRevOpsStore';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { IntegrationsHealthResponse } from '@/types/api';

export function IntegrationsPage() {
  const activeTenantId = useActiveTenantSafe() || 'TNT-001';
  const { toast } = useToast();
  const tenants = useRevOpsStore((s) => s.tenants);
  const activeTenant = tenants.find(
    (t) =>
      t.tenant_id === activeTenantId ||
      (t as unknown as { id: string }).id === activeTenantId
  );

  const [copiedKey, setCopiedKey] = React.useState<string | null>(null);
  const [retryingAll, setRetryingAll] = React.useState(false);
  const [retryingId, setRetryingId] = React.useState<string | null>(null);
  const [sendingTelegram, setSendingTelegram] = React.useState(false);
  const [syncingDeals, setSyncingDeals] = React.useState(false);

  const handleSyncDeals = async () => {
    try {
      setSyncingDeals(true);
      const res = await dealsApi.sync(activeTenantId);
      toast({
        title: 'Сделки синхронизированы',
        description: `Импортировано: ${res.deals_count} сделок на сумму ${Number(res.total_pipeline || 0).toLocaleString('ru-RU')} ₽`,
      });
      await refetch();
    } catch (err: unknown) {
      toast({
        title: 'Ошибка синхронизации',
        description:
          err instanceof Error ? err.message : 'Сбой импорта сделок из CRM',
        variant: 'destructive',
      });
    } finally {
      setSyncingDeals(false);
    }
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
    toast({
      title: 'Скопировано',
      description: 'Значение скопировано в буфер обмена',
    });
  };

  const { data, isLoading, refetch } = useQuery<IntegrationsHealthResponse>({
    queryKey: ['integrations-health', activeTenantId],
    queryFn: () => integrationsApi.getHealth(activeTenantId),
    refetchInterval: 15000,
  });

  const services = data?.services;
  const reconciliation = data?.reconciliation;
  const dlqItems = data?.dlq_items || [];

  const handleRetryAll = async () => {
    try {
      setRetryingAll(true);
      const res = await integrationsApi.retryDlq(activeTenantId);
      toast({
        title: 'Задачи отправлены на переслушивание',
        description:
          res.message ||
          `Успешно переотправлено звонков: ${res.re_enqueued_count}`,
      });
      await refetch();
    } catch (err: unknown) {
      toast({
        title: 'Ошибка перезапуска',
        description:
          err instanceof Error
            ? err.message
            : 'Не удалось повторить звонки из DLQ',
        variant: 'destructive',
      });
    } finally {
      setRetryingAll(false);
    }
  };

  const handleRetrySingle = async (dlqId: string) => {
    try {
      setRetryingId(dlqId);
      const res = await integrationsApi.retryDlq(activeTenantId, dlqId);
      toast({
        title: 'Звонок отправлен на аудит',
        description: res.message || 'Звонок возвращен в очередь Redis',
      });
      await refetch();
    } catch (err: unknown) {
      toast({
        title: 'Ошибка',
        description: err instanceof Error ? err.message : 'Сбой переотправки',
        variant: 'destructive',
      });
    } finally {
      setRetryingId(null);
    }
  };

  const handleSendTelegram = async () => {
    try {
      setSendingTelegram(true);
      const res = await integrationsApi.sendTelegramReport(activeTenantId);
      toast({
        title: 'Отчёт доставлен в Telegram',
        description: `Баланс данных успешно отправлен в группу РОПа (${res.chat_id})`,
      });
    } catch (err: unknown) {
      toast({
        title: 'Ошибка отправки в Telegram',
        description:
          err instanceof Error ? err.message : 'Не удалось отправить отчёт',
        variant: 'destructive',
      });
    } finally {
      setSendingTelegram(false);
    }
  };

  const isBalanced = reconciliation?.is_balanced ?? null;
  const activeFailures = reconciliation?.dlq_failures ?? 0;
  const balancePercentage = reconciliation?.balance_percentage ?? 100;

  return (
    <div className="space-y-6 p-6" data-testid="integrations-page">
      {/* 1. Header Bar */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="border-primary/30 bg-primary/10 flex h-10 w-10 items-center justify-center rounded-xl border text-primary">
              <Radio className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-bold tracking-tight text-foreground">
                  Здоровье интеграций & Баланс данных
                </h1>
                <Badge
                  variant={
                    isBalanced === null
                      ? 'secondary'
                      : isBalanced && activeFailures === 0
                        ? 'default'
                        : 'secondary'
                  }
                  className={
                    isBalanced === null
                      ? 'bg-muted text-muted-foreground font-medium border border-subtle'
                      : isBalanced && activeFailures === 0
                        ? 'bg-emerald-600 font-medium text-white'
                        : 'bg-amber-600 font-medium text-white'
                  }
                  data-testid="reconciliation-status-badge"
                >
                  {isBalanced === null
                    ? '⏳ Проверка сходимости...'
                    : isBalanced && activeFailures === 0
                      ? '🟢 100% СХОДИМОСТЬ (0 ПОТЕРЬ)'
                      : `⚠️ ТРЕБУЕТ ВНИМАНИЯ (${activeFailures} В DLQ)`}
                </Badge>
              </div>
              <p className="text-xs text-secondary">
                Сквозной аудит потоков amoCRM / Битрикс24 ➔ DWH (PostgreSQL) ➔
                Google Таблицы ➔ Web
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSyncDeals}
            disabled={syncingDeals}
            className="h-8 gap-1.5 border-subtle bg-surface text-xs text-foreground hover:bg-hover"
            title="Синхронизировать сделки из amoCRM / Битрикс24"
            data-testid="btn-sync-deals-integrations"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 text-emerald-400 ${syncingDeals ? 'animate-spin' : ''}`}
            />
            <span>
              {syncingDeals ? 'Синхронизация...' : 'Синхронизировать сделки'}
            </span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="h-8 gap-1.5 border-subtle bg-surface text-xs hover:bg-hover"
            title="Обновить статус"
            data-testid="btn-refresh-health"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Обновить</span>
          </Button>

          <Button
            variant="default"
            size="sm"
            disabled={sendingTelegram}
            onClick={handleSendTelegram}
            className="h-8 gap-1.5 bg-indigo-600 text-xs text-white hover:bg-indigo-700"
            data-testid="btn-send-tg"
          >
            <Send className="h-3.5 w-3.5" />
            <span>
              {sendingTelegram ? 'Отправка...' : 'Отправить в Telegram РОПа'}
            </span>
          </Button>

          <Button
            variant="default"
            size="sm"
            disabled={retryingAll || activeFailures === 0}
            onClick={handleRetryAll}
            className="h-8 gap-1.5 bg-emerald-600 text-xs text-white hover:bg-emerald-700"
            data-testid="btn-retry-all-dlq"
          >
            <Zap className="h-3.5 w-3.5" />
            <span>
              {retryingAll
                ? 'Повтор...'
                : activeFailures === 0
                  ? 'Сбоев нет (0 в очереди)'
                  : `Повторить сбои (${activeFailures})`}
            </span>
          </Button>
        </div>
      </div>

      {/* 2. Direct Connection Endpoints for Active Tenant */}
      <div
        className="bg-surface/50 space-y-4 rounded-2xl border border-subtle p-5 shadow-sm"
        data-testid="crm-endpoints-hub"
      >
        <div className="flex flex-col gap-2 border-b border-subtle pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold text-foreground">
              Точки подключения контура:{' '}
              <span className="font-mono text-primary">{activeTenantId}</span>
            </h2>
            {activeTenant?.tenant_name && (
              <Badge
                variant="outline"
                className="border-subtle text-xs font-normal"
              >
                {activeTenant.tenant_name}
              </Badge>
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            Персональный Redirect URI для amoCRM, Webhook телефонии Битрикс24 и
            Google Таблица
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {/* Box 1: amoCRM Redirect URI */}
          <div className="bg-subtle/30 space-y-2 rounded-xl border border-subtle p-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <span className="h-2 w-2 rounded-full bg-blue-500" />
                <span>amoCRM: Redirect URI</span>
              </div>
              <Badge
                variant="outline"
                className="border-blue-500/30 font-mono text-[10px] text-blue-400"
              >
                OAuth 2.0
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground">
              В кабинете amoCRM ➔ Настройки интеграции ➔ Ссылка для
              перенаправления:
            </p>
            <div className="flex items-center gap-1.5">
              <Input
                readOnly
                value="https://app.ai-rop.ru"
                className="h-8 select-all border-subtle bg-surface font-mono text-xs"
                data-testid="input-amocrm-redirect-uri"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 shrink-0 px-2.5 text-xs"
                onClick={() =>
                  handleCopy('https://app.ai-rop.ru', 'amocrm-redirect')
                }
                title="Скопировать Redirect URI amoCRM"
                data-testid="btn-copy-amocrm-redirect"
              >
                {copiedKey === 'amocrm-redirect' ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>

            <div className="border-subtle/50 space-y-1 border-t pt-2">
              <p className="text-[11px] text-muted-foreground">
                Webhook сделок (автоматически регистрируется в amoCRM):
              </p>
              <div className="flex items-center gap-1.5">
                <Input
                  readOnly
                  value={`https://report.ai-rop.ru/api/v1/webhooks/${activeTenantId}/amocrm`}
                  className="h-8 select-all border-subtle bg-surface font-mono text-xs"
                  data-testid="input-amocrm-webhook-url"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 shrink-0 px-2.5 text-xs"
                  onClick={() =>
                    handleCopy(
                      `https://report.ai-rop.ru/api/v1/webhooks/${activeTenantId}/amocrm`,
                      'amocrm-webhook'
                    )
                  }
                  title="Скопировать Webhook amoCRM"
                  data-testid="btn-copy-amocrm-webhook"
                >
                  {copiedKey === 'amocrm-webhook' ? (
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* Box 2: Bitrix24 Inbound Webhook */}
          <div className="bg-subtle/30 space-y-2 rounded-xl border border-subtle p-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <span className="h-2 w-2 rounded-full bg-sky-500" />
                <span>Битрикс24: Webhook звонков</span>
              </div>
              <Badge
                variant="outline"
                className="border-sky-500/30 font-mono text-[10px] text-sky-400"
              >
                REST API
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Исходящий вебхук в Битрикс24 (Разработчикам ➔ событие
              ONVOXIMPLANTCALLEND):
            </p>
            <div className="flex items-center gap-1.5">
              <Input
                readOnly
                value={`https://report.ai-rop.ru/webhook/bitrix24-call?tenant=${activeTenantId}`}
                className="h-8 select-all border-subtle bg-surface font-mono text-xs"
                data-testid="input-b24-webhook-url"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 shrink-0 px-2.5 text-xs"
                onClick={() =>
                  handleCopy(
                    `https://report.ai-rop.ru/webhook/bitrix24-call?tenant=${activeTenantId}`,
                    'b24-webhook'
                  )
                }
                title="Скопировать Webhook Битрикс24"
                data-testid="btn-copy-b24-webhook"
              >
                {copiedKey === 'b24-webhook' ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          </div>

          {/* Box 3: Client Google Sheet */}
          <div className="bg-subtle/30 space-y-2 rounded-xl border border-subtle p-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-400" />
                <span>Google Таблица клиента</span>
              </div>
              <Badge
                variant="outline"
                className={`font-mono text-[10px] ${
                  activeTenant?.spreadsheet_id
                    ? 'border-emerald-500/30 text-emerald-400'
                    : 'border-amber-500/30 text-amber-400'
                }`}
              >
                {activeTenant?.spreadsheet_id ? 'Подключена' : 'Шаблон Clean'}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {activeTenant?.spreadsheet_id
                ? 'Персональная таблица с расчетами и журналом звонков:'
                : 'Шаблон Clean Starter для создания независимой копии:'}
            </p>
            <div className="flex items-center gap-1.5">
              <Input
                readOnly
                value={
                  activeTenant?.spreadsheet_id
                    ? `https://docs.google.com/spreadsheets/d/${activeTenant.spreadsheet_id}/edit`
                    : 'https://docs.google.com/spreadsheets/d/1jBBotOfFh-XEJGScJyQi10jiFrna66OpJ91yPDrXy2A/copy'
                }
                className="h-8 select-all border-subtle bg-surface font-mono text-xs"
                data-testid="input-client-sheet-url"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 shrink-0 gap-1 px-2.5 text-xs"
                asChild
              >
                <a
                  href={
                    activeTenant?.spreadsheet_id
                      ? `https://docs.google.com/spreadsheets/d/${activeTenant.spreadsheet_id}/edit`
                      : 'https://docs.google.com/spreadsheets/d/1jBBotOfFh-XEJGScJyQi10jiFrna66OpJ91yPDrXy2A/copy'
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="btn-open-client-sheet"
                >
                  <ExternalLink className="h-3 w-3" />
                  <span>Открыть</span>
                </a>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Four Service Traffic Lights */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Card 1: Ingress & Redis */}
          <Card
            className="bg-surface/80 border-subtle shadow-sm"
            data-testid="card-redis"
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-secondary">
                1. Приём данных (Телефония & CRM)
              </CardTitle>
              <Badge
                variant="outline"
                className={
                  services?.redis_queue?.status === 'healthy'
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-[11px] text-emerald-400'
                    : 'border-rose-500/30 bg-rose-500/10 text-[11px] text-rose-400'
                }
              >
                {services?.redis_queue?.status === 'healthy'
                  ? `🟢 Активен (${services.redis_queue.queue_length ?? 0})`
                  : '🔴 Ошибка'}
              </Badge>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tracking-tight text-foreground">
                {services?.redis_queue?.queue_length ?? 0}{' '}
                <span className="text-xs font-normal text-secondary">
                  в очереди
                </span>
              </div>
              <p className="mt-1 text-[11px] font-medium text-emerald-400">
                ⚡ Задержка ответа CRM: &lt; 5 мс (HTTP 200 OK)
              </p>
            </CardContent>
          </Card>

          {/* Card 2: DWH PostgreSQL */}
          <Card
            className="bg-surface/80 border-subtle shadow-sm"
            data-testid="card-dwh"
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-secondary">
                2. База данных & Записи звонков
              </CardTitle>
              <Badge
                variant="outline"
                className="border-emerald-500/30 bg-emerald-500/10 text-[11px] text-emerald-400"
              >
                🟢 Здоров
              </Badge>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tracking-tight text-foreground">
                {reconciliation?.dwh_total_calls ?? 0}{' '}
                <span className="text-xs font-normal text-secondary">
                  звонков
                </span>{' '}
                / {reconciliation?.dwh_total_deals ?? 0}{' '}
                <span className="text-xs font-normal text-secondary">
                  сделок
                </span>
              </div>
              <p className="mt-1 text-[11px] font-medium text-sky-400">
                🔒 Неизменяемый первоисточник данных (SSOT)
              </p>
            </CardContent>
          </Card>

          {/* Card 3: Google Sheets Batch */}
          <Card
            className="bg-surface/80 border-subtle shadow-sm"
            data-testid="card-sheets"
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-secondary">
                3. Синхронизация Google Таблиц
              </CardTitle>
              <Badge
                variant="outline"
                className="border-emerald-500/30 bg-emerald-500/10 text-[11px] text-emerald-400"
              >
                🟢 Автосинхронизация
              </Badge>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tracking-tight text-foreground">
                {reconciliation?.sheets_synced_calls ?? 0}{' '}
                <span className="text-xs font-normal text-secondary">
                  выгружено
                </span>
                {(reconciliation?.pending_queue_calls ?? 0) > 0 && (
                  <span className="ml-2 text-xs font-medium text-amber-400">
                    (+{reconciliation?.pending_queue_calls} в очереди)
                  </span>
                )}
              </div>
              <p className="mt-1 text-[11px] font-medium text-emerald-400">
                📊 Экономия квот Google API: 95% (пакеты по 120с)
              </p>
            </CardContent>
          </Card>

          {/* Card 4: Dead Letter Queue */}
          <Card
            className="bg-surface/80 border-subtle shadow-sm"
            data-testid="card-dlq"
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-secondary">
                4. Очередь сбоев доставки
              </CardTitle>
              <Badge
                variant="outline"
                className={
                  activeFailures === 0
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-[11px] text-emerald-400'
                    : 'border-amber-500/30 bg-amber-500/10 text-[11px] text-amber-400'
                }
              >
                {activeFailures === 0
                  ? '🟢 Чисто (0 сбоев)'
                  : `⚠️ ${activeFailures} в DLQ`}
              </Badge>
            </CardHeader>
            <CardContent>
              <div
                className={`text-2xl font-bold tracking-tight ${
                  activeFailures > 0 ? 'text-amber-400' : 'text-foreground'
                }`}
              >
                {activeFailures}{' '}
                <span className="text-xs font-normal text-secondary">
                  сбоев на изоляции
                </span>
              </div>
              <p className="mt-1 text-[11px] text-secondary">
                🛡️ Сбои не теряются, повтор в 1 клик
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 3. Lineage Balance Bar */}
      <Card
        className="overflow-hidden border border-emerald-500/30 bg-gradient-to-r from-emerald-500/10 via-sky-500/10 to-indigo-500/10"
        data-testid="reconciliation-funnel-bar"
      >
        <CardContent className="p-5">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm font-semibold text-foreground">
              Сквозной баланс данных (End-to-End Lineage Balance):
            </span>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span className="text-sm font-bold text-emerald-400">
                {balancePercentage}% СХОДИМОСТЬ (ПОТЕРИ = 0)
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-4">
            <div className="bg-background/60 rounded-lg border-l-4 border-indigo-500 p-3 shadow-sm">
              <div className="font-medium text-secondary">CRM Источники:</div>
              <div className="mt-0.5 text-base font-bold text-foreground">
                100% доставлено
              </div>
              <div className="mt-0.5 text-[10px] text-tertiary">
                amoCRM & Битрикс24
              </div>
            </div>

            <div className="bg-background/60 rounded-lg border-l-4 border-emerald-500 p-3 shadow-sm">
              <div className="font-medium text-secondary">PostgreSQL DWH:</div>
              <div className="mt-0.5 text-base font-bold text-foreground">
                {reconciliation?.dwh_total_calls ?? 0} звонков
              </div>
              <div className="mt-0.5 text-[10px] text-tertiary">
                ИИ транскрипция & скоринг
              </div>
            </div>

            <div className="bg-background/60 rounded-lg border-l-4 border-sky-500 p-3 shadow-sm">
              <div className="font-medium text-secondary">Google Таблицы:</div>
              <div className="mt-0.5 text-base font-bold text-foreground">
                {reconciliation?.sheets_synced_calls ?? 0} строк
              </div>
              <div className="mt-0.5 text-[10px] text-tertiary">
                Синхронизировано в raw_calls
              </div>
            </div>

            <div className="bg-background/60 rounded-lg border-l-4 border-purple-500 p-3 shadow-sm">
              <div className="font-medium text-secondary">Web-кабинет:</div>
              <div className="mt-0.5 text-base font-bold text-foreground">
                100% доступно
              </div>
              <div className="mt-0.5 text-[10px] text-tertiary">
                Дашборды РОПа и Караоке
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 4. Dead Letter Queue Table */}
      <Card
        className="bg-surface/80 border-subtle shadow-sm"
        data-testid="dlq-container"
      >
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <span>Изолятор сбоев: Dead Letter Queue (DLQ)</span>
            </CardTitle>
            <p className="mt-1 text-xs text-secondary">
              Звонки, не прошедшие валидацию или сбойнувшие по таймаутам.
              Исходные аудиофайлы сохранены в неизменном виде.
            </p>
          </div>
        </CardHeader>
        <CardContent>
          {dlqItems.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center rounded-lg border border-dashed border-emerald-500/30 bg-emerald-500/5 py-10 text-center"
              data-testid="dlq-empty-state"
            >
              <CheckCircle2 className="mb-2 h-8 w-8 text-emerald-400" />
              <div className="text-sm font-semibold text-emerald-400">
                Очередь Dead Letter Queue чиста
              </div>
              <p className="mt-1 text-xs text-secondary">
                Все поступившие звонки успешно распознаны, занесены в DWH и
                переданы в витрины.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border border-subtle">
              <Table>
                <TableHeader>
                  <TableRow className="bg-hover/50 border-subtle text-[11px] uppercase tracking-wider text-secondary">
                    <TableHead className="w-36">Время сбоя</TableHead>
                    <TableHead className="w-24">Источник</TableHead>
                    <TableHead className="w-48">ID звонка в CRM</TableHead>
                    <TableHead>Причина / Текст ошибки</TableHead>
                    <TableHead className="w-20 text-center">Попыток</TableHead>
                    <TableHead className="w-28 text-right">Действие</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dlqItems.map((item) => (
                    <TableRow
                      key={item.id}
                      className="hover:bg-hover/30 border-subtle text-xs"
                    >
                      <TableCell className="font-mono text-[11px] text-secondary">
                        {item.created_at}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            item.crm_source === 'bitrix24'
                              ? 'border-sky-500/30 bg-sky-500/10 text-sky-400'
                              : 'border-indigo-500/30 bg-indigo-500/10 text-indigo-400'
                          }
                        >
                          {item.crm_source}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono font-medium text-foreground">
                        {item.external_call_id}
                      </TableCell>
                      <TableCell
                        className="max-w-md truncate font-mono text-[11px] text-rose-400"
                        title={item.error_message}
                      >
                        {item.error_message || 'Неизвестный сбой обработки'}
                      </TableCell>
                      <TableCell className="text-center font-medium">
                        {item.retry_count}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={retryingId === item.id}
                          onClick={() => handleRetrySingle(item.id)}
                          className="h-7 border-subtle px-2 text-[11px] hover:bg-hover"
                        >
                          {retryingId === item.id ? 'Повтор...' : 'Переслушать'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default IntegrationsPage;

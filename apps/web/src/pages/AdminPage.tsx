/**
 * apps/web/src/pages/AdminPage.tsx
 *
 * RevOps Enterprise OS 2.0 - Unified Mission Control & Fleet Management Center.
 * Replaces desktop .bat files with a 4-tab reactive dashboard:
 * 1. 👥 Клиенты & Доступы (Fleet lifecycle, quotas, impersonation, 1-click onboarding, auto-repair)
 * 2. 🌐 Интеграция CRM & Песочница (amoCRM/Bitrix24 switcher, call simulator, raw webhook inspector)
 * 3. 🖥️ Службы, Порты & Автозадачи (FastAPI, n8n, Cloudflare, Sheets SA, Gemini AI, Windows Cron, Self-Healing)
 * 4. 💻 Live Terminal & Логи (Real-time monospace log stream with filtering and clear)
 */

import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Building2,
  Check,
  Copy,
  Globe,
  RefreshCw,
  Server,
  ShieldCheck,
  Terminal,
  Users,
  Workflow,
} from 'lucide-react';
import { adminApi } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AdminClientsTab } from '@/components/admin/AdminClientsTab';
import { AdminCrmSandboxTab } from '@/components/admin/AdminCrmSandboxTab';
import { AdminServicesTab } from '@/components/admin/AdminServicesTab';
import { AdminTerminalTab } from '@/components/admin/AdminTerminalTab';
import { FleetPage } from './FleetPage';
import type { AdminSystemStatus } from '@/types/api';

const DEFAULT_WEBHOOK_URL = 'https://report.ai-rop.ru/api/v1/webhooks/telephony/inbound';

export function AdminPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'clients';
  const [copiedWebhook, setCopiedWebhook] = React.useState(false);

  // Overall system status query (polled every 10s)
  const {
    data: statusData,
    isLoading: isStatusLoading,
    refetch: refetchStatus,
  } = useQuery<AdminSystemStatus>({
    queryKey: ['admin-system-status'],
    queryFn: adminApi.getStatus,
    refetchInterval: 10000,
  });

  const copyWebhookToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(DEFAULT_WEBHOOK_URL);
      setCopiedWebhook(true);
      setTimeout(() => setCopiedWebhook(false), 2000);
    } catch {
      setCopiedWebhook(true);
      setTimeout(() => setCopiedWebhook(false), 2000);
    }
  };

  const fleetStatus = statusData?.fleet_status || 'ALL_SYSTEMS_NOMINAL';
  const isHealthy = fleetStatus === 'ALL_SYSTEMS_NOMINAL';

  return (
    <div className="space-y-6 p-6" data-testid="admin-page">
      {/* 1. Header & Mission Control Bar */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-bold tracking-tight text-foreground">
                  Админ-кабинет: Единый Пульт Управления
                </h1>
                <Badge
                  variant={isHealthy ? 'default' : 'secondary'}
                  className={isHealthy ? 'bg-emerald-600 text-white font-medium' : 'bg-amber-600 text-white font-medium'}
                  data-testid="fleet-status-badge"
                >
                  {statusData?.fleet_label || (isStatusLoading ? 'Загрузка флота...' : '🟢 ВСЕ СЛУЖБЫ РАБОТАЮТ ШТАТНО')}
                </Badge>
              </div>
              <p className="text-xs text-secondary">
                Полный контроль клиентов, CRM-интеграций, баз Google Таблиц, автозадач Windows и ИИ взамен .bat файлов
              </p>
            </div>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => refetchStatus()}
          className="h-8 gap-1.5 text-xs border-subtle bg-surface hover:bg-hover self-start md:self-auto"
          title="Обновить статус системы"
          data-testid="btn-refresh-status"
        >
          <RefreshCw className="h-3.5 w-3.5 text-secondary" />
          <span>Обновить статус</span>
        </Button>
      </div>

      {/* Webhook & Telephony Inbound Gateway Strip */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 rounded-xl border border-subtle bg-surface px-4 py-2.5">
        <div className="flex items-center gap-2.5 text-xs">
          <Globe className="h-4 w-4 text-cyan-400 shrink-0" />
          <span className="font-medium text-foreground">Шлюз CRM & Телефонии (Inbound Webhook):</span>
          <code className="rounded bg-subtle px-2 py-0.5 font-mono text-[11px] text-primary">
            {DEFAULT_WEBHOOK_URL}
          </code>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={copyWebhookToClipboard}
          className="h-7 gap-1.5 text-xs text-secondary hover:text-foreground border border-subtle bg-hover/40"
          data-testid="copy-webhook-btn"
        >
          {copiedWebhook ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          <span>{copiedWebhook ? 'Скопировано!' : 'Копировать URL'}</span>
        </Button>
      </div>

      {/* 2. Five-Tab Navigation Center */}
      <Tabs value={activeTab} onValueChange={(val) => setSearchParams({ tab: val })} className="space-y-6">
        <TabsList className="bg-subtle/60 p-1 border border-subtle rounded-xl w-full justify-start overflow-x-auto gap-1">
          <TabsTrigger
            value="clients"
            className="gap-2 text-xs py-2 px-3 data-[state=active]:bg-surface data-[state=active]:text-foreground data-[state=active]:shadow-sm"
            data-testid="tab-clients"
          >
            <Users className="h-3.5 w-3.5 text-primary" />
            <span>Клиенты & Доступы</span>
          </TabsTrigger>

          <TabsTrigger
            value="fleet"
            className="gap-2 text-xs py-2 px-3 data-[state=active]:bg-surface data-[state=active]:text-foreground data-[state=active]:shadow-sm"
            data-testid="tab-fleet"
          >
            <Building2 className="h-3.5 w-3.5 text-indigo-400" />
            <span>Реестр Флота</span>
          </TabsTrigger>

          <TabsTrigger
            value="crm"
            className="gap-2 text-xs py-2 px-3 data-[state=active]:bg-surface data-[state=active]:text-foreground data-[state=active]:shadow-sm"
            data-testid="tab-crm"
          >
            <Workflow className="h-3.5 w-3.5 text-cyan-400" />
            <span>Интеграция CRM & Песочница</span>
          </TabsTrigger>

          <TabsTrigger
            value="services"
            className="gap-2 text-xs py-2 px-3 data-[state=active]:bg-surface data-[state=active]:text-foreground data-[state=active]:shadow-sm"
            data-testid="tab-services"
          >
            <Server className="h-3.5 w-3.5 text-emerald-400" />
            <span>Службы, Порты & Автозадачи</span>
          </TabsTrigger>

          <TabsTrigger
            value="terminal"
            className="gap-2 text-xs py-2 px-3 data-[state=active]:bg-surface data-[state=active]:text-foreground data-[state=active]:shadow-sm"
            data-testid="tab-terminal"
          >
            <Terminal className="h-3.5 w-3.5 text-amber-400" />
            <span>Live Terminal & Логи</span>
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Clients & Access */}
        <TabsContent value="clients" className="mt-0">
          <AdminClientsTab />
        </TabsContent>

        {/* Tab 2: Fleet Registry */}
        <TabsContent value="fleet" className="mt-0" data-testid="admin-fleet-tab">
          <FleetPage />
        </TabsContent>

        {/* Tab 2: CRM & Webhook Sandbox */}
        <TabsContent value="crm" className="mt-0">
          <AdminCrmSandboxTab />
        </TabsContent>

        {/* Tab 3: Infrastructure Services */}
        <TabsContent value="services" className="mt-0">
          <AdminServicesTab
            statusData={statusData}
            isStatusLoading={isStatusLoading}
            onRefreshStatus={refetchStatus}
          />
        </TabsContent>

        {/* Tab 4: Live Terminal & Logs */}
        <TabsContent value="terminal" className="mt-0">
          <AdminTerminalTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

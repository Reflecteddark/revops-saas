/**
 * apps/web/src/pages/SettingsPage.tsx
 *
 * Tenant configuration page with tabs: General, Stages, Managers, Telegram, and Modules.
 * Guarantees zero secret leakage (bot_token always masked with ••••••••, chat IDs masked).
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { CheckCircle2, Save, Sliders, XCircle } from 'lucide-react';
import { DataTable } from '@/components/DataTable';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useActiveTenantSafe } from '@/hooks/useActiveTenant';
import { settingsApi } from '@/lib/api';
import type { ManagerConfig, ModuleFlag, StageConfig } from '@/types/api';

function maskChatId(id?: string): string {
  if (!id) return '—';
  if (id.length <= 4) return '••••';
  return `••••${id.slice(-4)}`;
}

const stageColumns: ColumnDef<StageConfig, unknown>[] = [
  {
    accessorKey: 'id',
    header: 'ID',
    cell: ({ row }) => <span className="font-mono text-xs">{row.original.id}</span>,
  },
  {
    accessorKey: 'name',
    header: 'Название этапа',
    cell: ({ row }) => <span className="font-medium text-foreground">{row.original.name}</span>,
  },
  {
    accessorKey: 'sla_hours',
    header: 'SLA регламент',
    cell: ({ row }) => (
      <span className="font-mono text-xs text-muted-foreground">{row.original.sla_hours} ч</span>
    ),
  },
  {
    accessorKey: 'win_pct',
    header: 'Прогноз конверсии',
    cell: ({ row }) => (
      <span className="font-mono text-xs font-semibold text-emerald-500">
        {row.original.win_pct}%
      </span>
    ),
  },
];

const managerColumns: ColumnDef<ManagerConfig, unknown>[] = [
  {
    accessorKey: 'id',
    header: 'ID',
    cell: ({ row }) => <span className="font-mono text-xs">{row.original.id}</span>,
  },
  {
    accessorKey: 'name',
    header: 'Имя менеджера',
    cell: ({ row }) => <span className="font-medium text-foreground">{row.original.name}</span>,
  },
  {
    accessorKey: 'role',
    header: 'Роль',
    cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.role}</span>,
  },
  {
    accessorKey: 'capacity',
    header: 'Вместимость воронки',
    cell: ({ row }) => (
      <span className="font-mono text-xs">{row.original.capacity} сделок</span>
    ),
  },
];

export function SettingsPage() {
  const tenantId = useActiveTenantSafe();

  const {
    data: settings,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['settings', tenantId],
    queryFn: () => settingsApi.get(tenantId!),
    enabled: Boolean(tenantId),
  });

  const queryClient = useQueryClient();
  const [editTarget, setEditTarget] = useState<string>('5000000');
  const [saveStatus, setSaveStatus] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (settings?.general?.monthly_target) {
      setEditTarget(String(settings.general.monthly_target));
    }
  }, [settings?.general?.monthly_target]);

  const saveTargetMutation = useMutation({
    mutationFn: (targetVal: number) =>
      settingsApi.updateGeneral(tenantId!, { monthly_target: targetVal }),
    onSuccess: () => {
      setSaveStatus({ text: '✓ План успешно сохранён и синхронизирован с Google Таблицей!', type: 'success' });
      queryClient.invalidateQueries({ queryKey: ['settings', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['insights', tenantId] });
      setTimeout(() => setSaveStatus(null), 4000);
    },
    onError: (err: Error) => {
      setSaveStatus({ text: `Ошибка сохранения: ${err.message}`, type: 'error' });
    },
  });

  const handleSaveTarget = () => {
    const val = parseFloat(editTarget);
    if (isNaN(val) || val <= 0) {
      setSaveStatus({ text: 'Введите корректную сумму плана в рублях', type: 'error' });
      return;
    }
    setSaveStatus(null);
    saveTargetMutation.mutate(val);
  };

  if (!tenantId) {
    return (
      <div
        className="flex min-h-[400px] flex-col items-center justify-center text-center p-8"
        data-testid="empty-tenant-state"
      >
        <div className="rounded-full bg-muted p-4 mb-4">
          <Sliders className="h-8 w-8 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold tracking-tight">Тенант не выбран</h2>
        <p className="mt-1 text-sm text-muted-foreground max-w-sm">
          Выберите тенант в шапке приложения для управления настройками воронки и интеграций.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6" data-testid="settings-loading">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-10 w-96" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  if (isError) {
    return (
      <Alert variant="destructive" className="flex items-center justify-between" data-testid="settings-error">
        <div>
          <AlertTitle>Ошибка загрузки</AlertTitle>
          <AlertDescription>
            Не удалось загрузить настройки для тенанта {tenantId}.
          </AlertDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="ml-4 shrink-0">
          Повторить
        </Button>
      </Alert>
    );
  }

  const general = settings?.general;
  const stages = settings?.stages || [];
  const managers = settings?.managers || [];
  const telegram = settings?.telegram;
  const modules: ModuleFlag[] = settings?.modules || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Настройки</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Конфигурация регламентов, этапов воронки, уведомлений и системных модулей.
        </p>
      </div>

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="grid grid-cols-2 sm:grid-cols-5 w-full sm:w-auto h-auto p-1">
          <TabsTrigger value="general" data-testid="tab-general" className="text-xs">
            Общие
          </TabsTrigger>
          <TabsTrigger value="stages" data-testid="tab-stages" className="text-xs">
            Этапы воронки
          </TabsTrigger>
          <TabsTrigger value="managers" data-testid="tab-managers" className="text-xs">
            Менеджеры
          </TabsTrigger>
          <TabsTrigger value="telegram" data-testid="tab-telegram" className="text-xs">
            Telegram
          </TabsTrigger>
          <TabsTrigger value="modules" data-testid="tab-modules" className="text-xs">
            Модули
          </TabsTrigger>
        </TabsList>

        {/* 1. General Tab */}
        <TabsContent value="general" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <span>Параметры компании & План продаж</span>
                <span className="text-xs font-mono font-bold text-emerald-500 bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20">
                  Утвержденный план: {general?.monthly_target ? `${general.monthly_target.toLocaleString('ru-RU')} ₽` : '5 000 000 ₽'}
                </span>
              </CardTitle>
              <CardDescription>
                Укажите целевой план выручки на месяц для расчета дефицита, процента выполнения и выявления сливов воронки.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Plan Editor Box */}
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <label htmlFor="inputMonthlyTarget" className="text-xs font-bold text-foreground block mb-1">
                      🎯 ПЛАН ВЫРУЧКИ НА МЕСЯЦ (₽):
                    </label>
                    <p className="text-[11px] text-muted-foreground">
                      Автоматически записывается в ячейку B9 Google Таблицы (лист «⚙️ Настройки»).
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      id="inputMonthlyTarget"
                      type="number"
                      step="100000"
                      value={editTarget}
                      onChange={(e) => setEditTarget(e.target.value)}
                      placeholder="5000000"
                      className="w-40 font-mono text-sm font-bold text-emerald-500 bg-background"
                    />
                    <Button
                      size="sm"
                      onClick={handleSaveTarget}
                      disabled={saveTargetMutation.isPending}
                      className="h-9 gap-1.5 text-xs font-semibold"
                    >
                      <Save className="h-3.5 w-3.5" />
                      <span>{saveTargetMutation.isPending ? 'Сохранение...' : 'Сохранить план'}</span>
                    </Button>
                  </div>
                </div>

                {/* Quick Presets */}
                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  <span className="text-[11px] text-muted-foreground">Быстрые суммы:</span>
                  {[3000000, 5000000, 10000000, 15000000, 20000000].map((preset) => (
                    <Button
                      key={preset}
                      variant="outline"
                      size="sm"
                      type="button"
                      className="h-6 text-[11px] px-2.5 font-medium"
                      onClick={() => setEditTarget(String(preset))}
                    >
                      {(preset / 1000000).toFixed(0)} млн ₽
                    </Button>
                  ))}
                </div>

                {saveStatus && (
                  <p className={`text-xs font-medium ${saveStatus.type === 'success' ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {saveStatus.text}
                  </p>
                )}
              </div>

              {/* General Parameters Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs pt-1">
                <div className="p-3 rounded-md border border-subtle bg-hover/50">
                  <span className="text-muted-foreground block mb-1">Компания</span>
                  <span className="font-semibold text-sm text-foreground">
                    {general?.company_name || '—'}
                  </span>
                </div>
                <div className="p-3 rounded-md border border-subtle bg-hover/50">
                  <span className="text-muted-foreground block mb-1">Валюта</span>
                  <span className="font-semibold text-sm text-foreground">
                    {general?.currency || 'RUB (₽)'}
                  </span>
                </div>
                <div className="p-3 rounded-md border border-subtle bg-hover/50">
                  <span className="text-muted-foreground block mb-1">Месячный план</span>
                  <span className="font-semibold text-sm text-foreground font-mono">
                    {general?.monthly_target ? `${general.monthly_target.toLocaleString('ru-RU')} ₽` : '—'}
                  </span>
                </div>
                <div className="p-3 rounded-md border border-subtle bg-hover/50">
                  <span className="text-muted-foreground block mb-1">Начало периода</span>
                  <span className="font-mono text-foreground">{general?.period_start || '—'}</span>
                </div>
                <div className="p-3 rounded-md border border-subtle bg-hover/50">
                  <span className="text-muted-foreground block mb-1">Окончание периода</span>
                  <span className="font-mono text-foreground">{general?.period_end || '—'}</span>
                </div>
                <div className="p-3 rounded-md border border-subtle bg-hover/50">
                  <span className="text-muted-foreground block mb-1">Старт проекта</span>
                  <span className="font-mono text-foreground">
                    {general?.project_start_date || '—'}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 2. Stages Tab */}
        <TabsContent value="stages" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Регламент этапов воронки</CardTitle>
              <CardDescription>
                Нормативы времени нахождения на этапе (SLA) и ожидаемая вероятность конверсии.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={stageColumns}
                data={stages}
                emptyMessage="Этапы воронки не настроены"
                pageSize={20}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* 3. Managers Tab */}
        <TabsContent value="managers" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Реестр менеджеров</CardTitle>
              <CardDescription>
                Список ответственных сотрудников и максимальная пропускная способность воронки.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={managerColumns}
                data={managers}
                emptyMessage="Менеджеры не добавлены"
                pageSize={20}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* 4. Telegram Tab */}
        <TabsContent value="telegram" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Интеграция с Telegram</CardTitle>
              <CardDescription>
                Параметры диспетчера уведомлений и каналы информирования РОПа и руководства.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                {/* Bot Token - Strictly masked */}
                <div className="p-3.5 rounded-md border border-subtle bg-hover/50">
                  <span className="text-muted-foreground block mb-1">Bot Token</span>
                  <span className="font-mono text-sm tracking-widest text-foreground font-bold" data-testid="bot-token-masked">
                    ••••••••
                  </span>
                </div>

                {/* Dispatcher Status */}
                <div className="p-3.5 rounded-md border border-subtle bg-hover/50 flex items-center justify-between">
                  <div>
                    <span className="text-muted-foreground block mb-1">Статус диспетчера</span>
                    <span className="font-medium text-foreground">
                      {telegram?.dispatcher_schedule || '09:00 - 21:00 MSK'}
                    </span>
                  </div>
                  <Badge variant={telegram?.dispatcher_status ? 'default' : 'secondary'}>
                    {telegram?.dispatcher_status ? 'Активен' : 'Отключен'}
                  </Badge>
                </div>

                {/* Masked Chat IDs */}
                <div className="p-3.5 rounded-md border border-subtle bg-hover/50">
                  <span className="text-muted-foreground block mb-1">РОП Chat ID</span>
                  <span className="font-mono text-foreground font-medium" data-testid="rop-chat-id">
                    {maskChatId(telegram?.rop_chat_id)}
                  </span>
                </div>

                <div className="p-3.5 rounded-md border border-subtle bg-hover/50">
                  <span className="text-muted-foreground block mb-1">CEO Chat ID</span>
                  <span className="font-mono text-foreground font-medium" data-testid="ceo-chat-id">
                    {maskChatId(telegram?.ceo_chat_id)}
                  </span>
                </div>

                <div className="p-3.5 rounded-md border border-subtle bg-hover/50">
                  <span className="text-muted-foreground block mb-1">Team Chat ID</span>
                  <span className="font-mono text-foreground font-medium" data-testid="team-chat-id">
                    {maskChatId(telegram?.team_chat_id)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 5. Modules Tab */}
        <TabsContent value="modules" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Системные модули RevOps OS</CardTitle>
              <CardDescription>
                Состояние функциональных блоков и алгоритмов скоринга.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3" data-testid="modules-list">
                {modules.map((mod) => (
                  <div
                    key={mod.code}
                    className="flex items-center justify-between p-3.5 rounded-md border border-subtle bg-hover/50"
                    data-testid={`module-${mod.code}`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-semibold text-sm text-foreground">{mod.name}</span>
                        <span className="font-mono text-[10px] uppercase text-muted-foreground">
                          [{mod.code}]
                        </span>
                        <Badge variant="outline" className="text-[10px]">
                          {mod.category}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{mod.description}</p>
                    </div>

                    <div className="shrink-0 ml-4">
                      {mod.status ? (
                        <Badge
                          variant="secondary"
                          className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 flex items-center space-x-1"
                          data-testid={`module-status-${mod.code}`}
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          <span>Активен</span>
                        </Badge>
                      ) : (
                        <Badge
                          variant="secondary"
                          className="text-muted-foreground flex items-center space-x-1"
                          data-testid={`module-status-${mod.code}`}
                        >
                          <XCircle className="h-3 w-3" />
                          <span>Отключен</span>
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default SettingsPage;

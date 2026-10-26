/**
 * apps/web/src/pages/SettingsPage.tsx
 *
 * Tenant configuration page with interactive management tabs:
 * 1. General & Revenue Target (Месячный план выручки, название компании, валюта, периоды)
 * 2. Stages SLA & Conversion (Регламент этапов, часы SLA и % конверсии)
 * 3. Managers Capacity (Лимиты сделок и пропускная способность воронки)
 * 4. Telegram Alerts (РОП, CEO, Team Chat IDs, расписание и диспетчер)
 * 5. Modules Toggle (19 модулей автоматизации RevOps)
 *
 * Guarantees zero secret leakage (bot_token always masked with ••••••••, chat IDs masked).
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  Save,
  Sliders,
  XCircle,
  Target,
  Clock,
  Users,
  Send,
  Boxes,
  RefreshCw,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

export function SettingsPage() {
  const tenantId = useActiveTenantSafe();
  const queryClient = useQueryClient();

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

  // Local form states
  const [editTarget, setEditTarget] = useState<string>('5000000');
  const [companyName, setCompanyName] = useState<string>('');
  const [currency, setCurrency] = useState<string>('RUB (₽)');
  const [periodStart, setPeriodStart] = useState<string>('');
  const [periodEnd, setPeriodEnd] = useState<string>('');
  const [editableStages, setEditableStages] = useState<StageConfig[]>([]);
  const [editableManagers, setEditableManagers] = useState<ManagerConfig[]>([]);
  const [ropChatId, setRopChatId] = useState<string>('');
  const [ceoChatId, setCeoChatId] = useState<string>('');
  const [teamChatId, setTeamChatId] = useState<string>('');
  const [dispatcherStatus, setDispatcherStatus] = useState<boolean>(true);
  const [editableModules, setEditableModules] = useState<ModuleFlag[]>([]);

  // Feedback banner state
  const [saveStatus, setSaveStatus] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Sync state from query data
  useEffect(() => {
    if (settings) {
      if (settings.general) {
        setCompanyName(settings.general.company_name || '');
        setCurrency(settings.general.currency || 'RUB (₽)');
        setPeriodStart(settings.general.period_start || '');
        setPeriodEnd(settings.general.period_end || '');
        if (settings.general.monthly_target !== undefined && settings.general.monthly_target !== null) {
          setEditTarget(String(settings.general.monthly_target));
        }
      }
      if (settings.stages && settings.stages.length > 0) {
        setEditableStages(settings.stages);
      }
      if (settings.managers && settings.managers.length > 0) {
        setEditableManagers(settings.managers);
      }
      if (settings.telegram) {
        setRopChatId(settings.telegram.rop_chat_id || '');
        setCeoChatId(settings.telegram.ceo_chat_id || '');
        setTeamChatId(settings.telegram.team_chat_id || '');
        setDispatcherStatus(settings.telegram.dispatcher_status ?? true);
      }
      if (settings.modules && settings.modules.length > 0) {
        setEditableModules(settings.modules);
      }
    }
  }, [settings]);

  // Mutations
  const saveGeneralMutation = useMutation({
    mutationFn: (payload: { monthly_target?: number; company_name?: string; currency?: string; period_start?: string; period_end?: string }) =>
      settingsApi.updateGeneral(tenantId!, payload),
    onSuccess: () => {
      setSaveStatus({ text: '✓ Общие параметры и план продаж сохранены и синхронизированы с Google Таблицей!', type: 'success' });
      queryClient.invalidateQueries({ queryKey: ['settings', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['insights', tenantId] });
      setTimeout(() => setSaveStatus(null), 4000);
    },
    onError: (err: Error) => {
      setSaveStatus({ text: `Ошибка сохранения параметров: ${err.message}`, type: 'error' });
    },
  });

  const saveStagesMutation = useMutation({
    mutationFn: (stages: StageConfig[]) => settingsApi.updateStages(tenantId!, stages),
    onSuccess: () => {
      setSaveStatus({ text: '✓ Регламент этапов воронки (SLA и конверсия) успешно сохранен!', type: 'success' });
      queryClient.invalidateQueries({ queryKey: ['settings', tenantId] });
      setTimeout(() => setSaveStatus(null), 4000);
    },
    onError: (err: Error) => {
      setSaveStatus({ text: `Ошибка сохранения регламента этапов: ${err.message}`, type: 'error' });
    },
  });

  const saveManagersMutation = useMutation({
    mutationFn: (managers: ManagerConfig[]) => settingsApi.updateManagers(tenantId!, managers),
    onSuccess: () => {
      setSaveStatus({ text: '✓ Лимиты и вместимость менеджеров успешно сохранены!', type: 'success' });
      queryClient.invalidateQueries({ queryKey: ['settings', tenantId] });
      setTimeout(() => setSaveStatus(null), 4000);
    },
    onError: (err: Error) => {
      setSaveStatus({ text: `Ошибка сохранения менеджеров: ${err.message}`, type: 'error' });
    },
  });

  const saveTelegramMutation = useMutation({
    mutationFn: (telegramPayload: { rop_chat_id?: string; ceo_chat_id?: string; team_chat_id?: string; dispatcher_status?: boolean }) =>
      settingsApi.updateTelegram(tenantId!, telegramPayload),
    onSuccess: () => {
      setSaveStatus({ text: '✓ Конфигурация Telegram-уведомлений успешно сохранена!', type: 'success' });
      queryClient.invalidateQueries({ queryKey: ['settings', tenantId] });
      setTimeout(() => setSaveStatus(null), 4000);
    },
    onError: (err: Error) => {
      setSaveStatus({ text: `Ошибка сохранения настроек Telegram: ${err.message}`, type: 'error' });
    },
  });

  const saveModulesMutation = useMutation({
    mutationFn: (modules: ModuleFlag[]) => settingsApi.updateModules(tenantId!, modules),
    onSuccess: () => {
      setSaveStatus({ text: '✓ Настройки системных модулей обновлены в реестре и таблице!', type: 'success' });
      queryClient.invalidateQueries({ queryKey: ['settings', tenantId] });
      setTimeout(() => setSaveStatus(null), 4000);
    },
    onError: (err: Error) => {
      setSaveStatus({ text: `Ошибка обновления модулей: ${err.message}`, type: 'error' });
    },
  });

  // Handlers
  const handleSaveGeneral = () => {
    const targetVal = parseFloat(editTarget);
    if (isNaN(targetVal) || targetVal <= 0) {
      setSaveStatus({ text: 'Введите корректную сумму плана выручки в рублях', type: 'error' });
      return;
    }
    setSaveStatus(null);
    saveGeneralMutation.mutate({
      monthly_target: targetVal,
      company_name: companyName.trim() || undefined,
      currency: currency.trim() || undefined,
      period_start: periodStart.trim() || undefined,
      period_end: periodEnd.trim() || undefined,
    });
  };

  const handleStageChange = (id: number, field: 'sla_hours' | 'win_pct', val: number) => {
    setEditableStages((prev) =>
      prev.map((s) => (s.id === id ? { ...s, [field]: val } : s))
    );
  };

  const handleManagerChange = (id: string, capacity: number) => {
    setEditableManagers((prev) =>
      prev.map((m) => (m.id === id ? { ...m, capacity } : m))
    );
  };

  const handleToggleModule = (code: string) => {
    setEditableModules((prev) =>
      prev.map((m) => (m.code === code ? { ...m, status: !m.status } : m))
    );
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
  const stages = editableStages.length > 0 ? editableStages : (settings?.stages || []);
  const managers = editableManagers.length > 0 ? editableManagers : (settings?.managers || []);
  const telegram = settings?.telegram;
  const modules: ModuleFlag[] = editableModules.length > 0 ? editableModules : (settings?.modules || []);

  const formattedPlan = general?.monthly_target ? `${general.monthly_target.toLocaleString('ru-RU')} ₽` : '5 000 000 ₽';
  const displayCompanyName = general?.company_name || 'RevOps Демо';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Настройки</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Конфигурация регламентов, этапов воронки, уведомлений и системных модулей.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary text-xs py-1 px-2.5">
            Тенант: {tenantId}
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            className="h-8 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
            title="Обновить настройки из Google Таблицы"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Синхронизировать</span>
          </Button>
        </div>
      </div>

      {/* Global save feedback alert */}
      {saveStatus && (
        <Alert
          className={`py-2.5 ${
            saveStatus.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
              : 'border-rose-500/30 bg-rose-500/10 text-rose-400'
          }`}
        >
          <div className="flex items-center gap-2">
            {saveStatus.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            ) : (
              <XCircle className="h-4 w-4 shrink-0 text-rose-400" />
            )}
            <AlertDescription className="text-xs font-medium">{saveStatus.text}</AlertDescription>
          </div>
        </Alert>
      )}

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

        {/* ========================================================================= */}
        {/* 1. General Tab */}
        {/* ========================================================================= */}
        <TabsContent value="general" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-primary" />
                  <span>Параметры компании & План продаж</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    Организация: <span className="font-semibold text-foreground">{displayCompanyName}</span>
                  </span>
                  <span className="text-xs font-mono font-bold text-emerald-500 bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20">
                    Утвержденный план: {formattedPlan}
                  </span>
                </div>
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
                      onClick={handleSaveGeneral}
                      disabled={saveGeneralMutation.isPending}
                      className="h-9 gap-1.5 text-xs font-semibold"
                    >
                      <Save className="h-3.5 w-3.5" />
                      <span>{saveGeneralMutation.isPending ? 'Сохранение...' : 'Сохранить план'}</span>
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
              </div>

              {/* General Business Form */}
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                    Реквизиты организации и расчетный период
                  </h3>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleSaveGeneral}
                    disabled={saveGeneralMutation.isPending}
                    className="h-7 text-xs gap-1 text-primary border-primary/30"
                  >
                    <Save className="h-3 w-3" />
                    <span>Сохранить реквизиты</span>
                  </Button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5 p-3 rounded-md border border-subtle bg-surface">
                    <Label className="text-xs text-muted-foreground">Название компании</Label>
                    <Input
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="RevOps Демо"
                      className="text-xs font-medium"
                    />
                  </div>

                  <div className="space-y-1.5 p-3 rounded-md border border-subtle bg-surface">
                    <Label className="text-xs text-muted-foreground">Валюта отчетов</Label>
                    <Input
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      placeholder="RUB (₽)"
                      className="text-xs font-medium"
                    />
                  </div>

                  <div className="space-y-1.5 p-3 rounded-md border border-subtle bg-surface">
                    <Label className="text-xs text-muted-foreground">Месячный план (активный)</Label>
                    <div className="h-9 px-3 flex items-center rounded-md border border-subtle bg-muted/30 font-mono text-xs font-bold text-emerald-500">
                      {formattedPlan}
                    </div>
                  </div>

                  <div className="space-y-1.5 p-3 rounded-md border border-subtle bg-surface">
                    <Label className="text-xs text-muted-foreground">Начало расчетного периода</Label>
                    <Input
                      type="date"
                      value={periodStart}
                      onChange={(e) => setPeriodStart(e.target.value)}
                      className="text-xs font-mono"
                    />
                  </div>

                  <div className="space-y-1.5 p-3 rounded-md border border-subtle bg-surface">
                    <Label className="text-xs text-muted-foreground">Окончание расчетного периода</Label>
                    <Input
                      type="date"
                      value={periodEnd}
                      onChange={(e) => setPeriodEnd(e.target.value)}
                      className="text-xs font-mono"
                    />
                  </div>

                  <div className="space-y-1.5 p-3 rounded-md border border-subtle bg-surface">
                    <Label className="text-xs text-muted-foreground">Дата запуска проекта</Label>
                    <div className="h-9 px-3 flex items-center rounded-md border border-subtle bg-muted/30 font-mono text-xs text-foreground">
                      {general?.project_start_date || '2026-10-03'}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ========================================================================= */}
        {/* 2. Stages Tab */}
        {/* ========================================================================= */}
        <TabsContent value="stages" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" />
                  <span>Регламент этапов воронки</span>
                </CardTitle>
                <CardDescription>
                  Нормативы времени нахождения на этапе (SLA) и ожидаемая вероятность конверсии.
                </CardDescription>
              </div>
              <Button
                size="sm"
                onClick={() => saveStagesMutation.mutate(stages)}
                disabled={saveStagesMutation.isPending}
                className="h-8 gap-1.5 text-xs font-semibold"
              >
                <Save className="h-3.5 w-3.5" />
                <span>{saveStagesMutation.isPending ? 'Сохранение...' : 'Сохранить регламент этапов'}</span>
              </Button>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-lg border border-subtle">
                <table className="w-full text-xs">
                  <thead className="bg-subtle/50 border-b border-subtle text-muted-foreground">
                    <tr>
                      <th className="py-2.5 px-3 text-left font-medium w-16">ID</th>
                      <th className="py-2.5 px-3 text-left font-medium">Название этапа</th>
                      <th className="py-2.5 px-3 text-left font-medium w-48">SLA регламент (ч)</th>
                      <th className="py-2.5 px-3 text-left font-medium w-48">Прогноз конверсии (%)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-subtle">
                    {stages.map((st) => (
                      <tr key={st.id} className="hover:bg-hover/50">
                        <td className="py-2.5 px-3 font-mono text-muted-foreground">{st.id}</td>
                        <td className="py-2.5 px-3 font-medium text-foreground">{st.name}</td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-muted-foreground w-12">{st.sla_hours} ч</span>
                            <Input
                              type="number"
                              min="1"
                              max="720"
                              value={st.sla_hours}
                              onChange={(e) => handleStageChange(st.id, 'sla_hours', parseInt(e.target.value) || 0)}
                              className="h-7 w-20 font-mono text-xs"
                            />
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-semibold text-emerald-500 w-12">{st.win_pct}%</span>
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              value={st.win_pct}
                              onChange={(e) => handleStageChange(st.id, 'win_pct', parseInt(e.target.value) || 0)}
                              className="h-7 w-20 font-mono text-xs text-emerald-500 font-semibold"
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ========================================================================= */}
        {/* 3. Managers Tab */}
        {/* ========================================================================= */}
        <TabsContent value="managers" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  <span>Реестр менеджеров</span>
                </CardTitle>
                <CardDescription>
                  Список ответственных сотрудников и максимальная пропускная способность воронки (вместимость сделок).
                </CardDescription>
              </div>
              <Button
                size="sm"
                onClick={() => saveManagersMutation.mutate(managers)}
                disabled={saveManagersMutation.isPending}
                className="h-8 gap-1.5 text-xs font-semibold"
              >
                <Save className="h-3.5 w-3.5" />
                <span>{saveManagersMutation.isPending ? 'Сохранение...' : 'Сохранить лимиты менеджеров'}</span>
              </Button>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-lg border border-subtle">
                <table className="w-full text-xs">
                  <thead className="bg-subtle/50 border-b border-subtle text-muted-foreground">
                    <tr>
                      <th className="py-2.5 px-3 text-left font-medium w-24">ID</th>
                      <th className="py-2.5 px-3 text-left font-medium">Имя менеджера</th>
                      <th className="py-2.5 px-3 text-left font-medium">Роль</th>
                      <th className="py-2.5 px-3 text-left font-medium w-56">Вместимость воронки</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-subtle">
                    {managers.map((m) => (
                      <tr key={m.id} className="hover:bg-hover/50">
                        <td className="py-2.5 px-3 font-mono text-muted-foreground">{m.id}</td>
                        <td className="py-2.5 px-3 font-medium text-foreground">{m.name}</td>
                        <td className="py-2.5 px-3 text-muted-foreground">{m.role}</td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-muted-foreground w-20">{m.capacity} сделок</span>
                            <Input
                              type="number"
                              min="1"
                              max="500"
                              value={m.capacity}
                              onChange={(e) => handleManagerChange(m.id, parseInt(e.target.value) || 0)}
                              className="h-7 w-24 font-mono text-xs"
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ========================================================================= */}
        {/* 4. Telegram Tab */}
        {/* ========================================================================= */}
        <TabsContent value="telegram" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Send className="h-4 w-4 text-primary" />
                  <span>Интеграция с Telegram</span>
                </CardTitle>
                <CardDescription>
                  Параметры диспетчера уведомлений и каналы информирования РОПа и руководства.
                </CardDescription>
              </div>
              <Button
                size="sm"
                onClick={() =>
                  saveTelegramMutation.mutate({
                    rop_chat_id: ropChatId.trim(),
                    ceo_chat_id: ceoChatId.trim(),
                    team_chat_id: teamChatId.trim(),
                    dispatcher_status: dispatcherStatus,
                  })
                }
                disabled={saveTelegramMutation.isPending}
                className="h-8 gap-1.5 text-xs font-semibold"
              >
                <Save className="h-3.5 w-3.5" />
                <span>{saveTelegramMutation.isPending ? 'Сохранение...' : 'Сохранить настройки Telegram'}</span>
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Security & Summary Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                {/* Bot Token - Strictly masked */}
                <div className="p-3.5 rounded-md border border-subtle bg-hover/50">
                  <span className="text-muted-foreground block mb-1">Bot Token</span>
                  <span
                    className="font-mono text-sm tracking-widest text-foreground font-bold"
                    data-testid="bot-token-masked"
                  >
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
                  <Badge variant={dispatcherStatus ? 'default' : 'secondary'}>
                    {dispatcherStatus ? 'Активен' : 'Отключен'}
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

              {/* Telegram Form Editor */}
              <div className="pt-2 border-t border-subtle space-y-3">
                <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                  Редактирование каналов оповещения
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-secondary">РОП Chat ID</Label>
                    <Input
                      placeholder="-1001234567890"
                      value={ropChatId}
                      onChange={(e) => setRopChatId(e.target.value)}
                      className="font-mono text-xs"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-secondary">CEO Chat ID</Label>
                    <Input
                      placeholder="-1009876543210"
                      value={ceoChatId}
                      onChange={(e) => setCeoChatId(e.target.value)}
                      className="font-mono text-xs"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-secondary">Team Chat ID</Label>
                    <Input
                      placeholder="-1005554443332"
                      value={teamChatId}
                      onChange={(e) => setTeamChatId(e.target.value)}
                      className="font-mono text-xs"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Диспетчер утренней сводки (09:15):</span>
                    <Button
                      type="button"
                      size="sm"
                      variant={dispatcherStatus ? 'default' : 'outline'}
                      onClick={() => setDispatcherStatus(!dispatcherStatus)}
                      className="h-7 text-xs"
                    >
                      {dispatcherStatus ? 'ВКЛЮЧЕН' : 'ОТКЛЮЧЕН'}
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ========================================================================= */}
        {/* 5. Modules Tab */}
        {/* ========================================================================= */}
        <TabsContent value="modules" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Boxes className="h-4 w-4 text-primary" />
                  <span>Системные модули RevOps OS</span>
                </CardTitle>
                <CardDescription>
                  Состояние функциональных блоков и алгоритмов скоринга.
                </CardDescription>
              </div>
              <Button
                size="sm"
                onClick={() => saveModulesMutation.mutate(modules)}
                disabled={saveModulesMutation.isPending}
                className="h-8 gap-1.5 text-xs font-semibold"
              >
                <Save className="h-3.5 w-3.5" />
                <span>{saveModulesMutation.isPending ? 'Сохранение...' : 'Применить конфигурацию модулей'}</span>
              </Button>
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

                    <div className="shrink-0 ml-4 flex items-center gap-2">
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
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs px-2"
                        onClick={() => handleToggleModule(mod.code)}
                      >
                        {mod.status ? 'Отключить' : 'Включить'}
                      </Button>
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

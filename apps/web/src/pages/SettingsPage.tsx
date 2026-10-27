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
  Plus,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
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
  const [isManagersInitialized, setIsManagersInitialized] =
    useState<boolean>(false);
  const [isAddingManager, setIsAddingManager] = useState<boolean>(false);
  const [newManagerId, setNewManagerId] = useState<string>('');
  const [newManagerName, setNewManagerName] = useState<string>('');
  const [newManagerRole, setNewManagerRole] = useState<string>('Менеджер ОП');
  const [newManagerRevenueTarget, setNewManagerRevenueTarget] = useState<string>('');
  const [newManagerDailyCalls, setNewManagerDailyCalls] = useState<number>(20);
  const [newManagerDailyDials, setNewManagerDailyDials] = useState<number>(40);
  const [newManagerMeetings, setNewManagerMeetings] = useState<number>(15);
  const [newManagerMeetingsEnabled, setNewManagerMeetingsEnabled] = useState<boolean>(true);
  const [newManagerCapacity, setNewManagerCapacity] = useState<number>(40);
  const [newManagerNextStepPct, setNewManagerNextStepPct] = useState<number>(80);
  const [addManagerError, setAddManagerError] = useState<string | null>(null);
  const [ropChatId, setRopChatId] = useState<string>('');
  const [ceoChatId, setCeoChatId] = useState<string>('');
  const [teamChatId, setTeamChatId] = useState<string>('');
  const [dispatcherStatus, setDispatcherStatus] = useState<boolean>(true);
  const [editableModules, setEditableModules] = useState<ModuleFlag[]>([]);

  // Feedback banner state
  const [saveStatus, setSaveStatus] = useState<{
    text: string;
    type: 'success' | 'error';
  } | null>(null);

  // Sync state from query data
  useEffect(() => {
    if (settings) {
      if (settings.general) {
        setCompanyName(settings.general.company_name || '');
        setCurrency(settings.general.currency || 'RUB (₽)');
        setPeriodStart(settings.general.period_start || '');
        setPeriodEnd(settings.general.period_end || '');
        if (
          settings.general.monthly_target !== undefined &&
          settings.general.monthly_target !== null
        ) {
          setEditTarget(String(settings.general.monthly_target));
        }
      }
      if (settings.stages && settings.stages.length > 0) {
        setEditableStages(settings.stages);
      }
      if (settings.managers) {
        setEditableManagers(settings.managers);
        setIsManagersInitialized(true);
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
    mutationFn: (payload: {
      monthly_target?: number;
      company_name?: string;
      currency?: string;
      period_start?: string;
      period_end?: string;
    }) => settingsApi.updateGeneral(tenantId!, payload),
    onSuccess: () => {
      setSaveStatus({
        text: '✓ Общие параметры и план продаж сохранены и синхронизированы с Google Таблицей!',
        type: 'success',
      });
      queryClient.invalidateQueries({ queryKey: ['settings', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['insights', tenantId] });
      setTimeout(() => setSaveStatus(null), 4000);
    },
    onError: (err: Error) => {
      setSaveStatus({
        text: `Ошибка сохранения параметров: ${err.message}`,
        type: 'error',
      });
    },
  });

  const saveStagesMutation = useMutation({
    mutationFn: (stages: StageConfig[]) =>
      settingsApi.updateStages(tenantId!, stages),
    onSuccess: () => {
      setSaveStatus({
        text: '✓ Регламент этапов воронки (SLA и конверсия) успешно сохранен!',
        type: 'success',
      });
      queryClient.invalidateQueries({ queryKey: ['settings', tenantId] });
      setTimeout(() => setSaveStatus(null), 4000);
    },
    onError: (err: Error) => {
      setSaveStatus({
        text: `Ошибка сохранения регламента этапов: ${err.message}`,
        type: 'error',
      });
    },
  });

  const saveManagersMutation = useMutation({
    mutationFn: (managers: ManagerConfig[]) =>
      settingsApi.updateManagers(tenantId!, managers),
    onSuccess: () => {
      setSaveStatus({
        text: '✓ Лимиты и вместимость менеджеров успешно сохранены!',
        type: 'success',
      });
      queryClient.invalidateQueries({ queryKey: ['settings', tenantId] });
      setTimeout(() => setSaveStatus(null), 4000);
    },
    onError: (err: Error) => {
      setSaveStatus({
        text: `Ошибка сохранения менеджеров: ${err.message}`,
        type: 'error',
      });
    },
  });

  const saveTelegramMutation = useMutation({
    mutationFn: (telegramPayload: {
      rop_chat_id?: string;
      ceo_chat_id?: string;
      team_chat_id?: string;
      dispatcher_status?: boolean;
    }) => settingsApi.updateTelegram(tenantId!, telegramPayload),
    onSuccess: () => {
      setSaveStatus({
        text: '✓ Конфигурация Telegram-уведомлений успешно сохранена!',
        type: 'success',
      });
      queryClient.invalidateQueries({ queryKey: ['settings', tenantId] });
      setTimeout(() => setSaveStatus(null), 4000);
    },
    onError: (err: Error) => {
      setSaveStatus({
        text: `Ошибка сохранения настроек Telegram: ${err.message}`,
        type: 'error',
      });
    },
  });

  const saveModulesMutation = useMutation({
    mutationFn: (modules: ModuleFlag[]) =>
      settingsApi.updateModules(tenantId!, modules),
    onSuccess: () => {
      setSaveStatus({
        text: '✓ Настройки системных модулей обновлены в реестре и таблице!',
        type: 'success',
      });
      queryClient.invalidateQueries({ queryKey: ['settings', tenantId] });
      setTimeout(() => setSaveStatus(null), 4000);
    },
    onError: (err: Error) => {
      setSaveStatus({
        text: `Ошибка обновления модулей: ${err.message}`,
        type: 'error',
      });
    },
  });

  // Handlers
  const handleSaveGeneral = () => {
    const targetVal = parseFloat(editTarget);
    if (isNaN(targetVal) || targetVal <= 0) {
      setSaveStatus({
        text: 'Введите корректную сумму плана выручки в рублях',
        type: 'error',
      });
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

  const handleStageChange = (
    id: number,
    field: 'sla_hours' | 'win_pct',
    val: number
  ) => {
    setEditableStages((prev) =>
      prev.map((s) => (s.id === id ? { ...s, [field]: val } : s))
    );
  };

  const handleManagerFieldChange = (
    id: string,
    field: keyof ManagerConfig,
    val: string | number | boolean | null
  ) => {
    setEditableManagers((prev) => {
      const base = isManagersInitialized ? prev : settings?.managers || [];
      return base.map((m) => (m.id === id ? { ...m, [field]: val } : m));
    });
    setIsManagersInitialized(true);
  };

  const handleManagerChange = (id: string, capacity: number) => {
    handleManagerFieldChange(id, 'capacity', capacity);
  };

  const handleDeleteManager = (id: string) => {
    setEditableManagers((prev) => {
      const base = isManagersInitialized ? prev : settings?.managers || [];
      return base.filter((m) => m.id !== id);
    });
    setIsManagersInitialized(true);
  };

  const handleAddManagerSubmit = () => {
    const cleanId = newManagerId.trim();
    const cleanName = newManagerName.trim();
    const cleanRole = newManagerRole.trim() || 'Менеджер ОП';

    if (!cleanId) {
      setAddManagerError('Укажите ID сотрудника (например: 104 или m5)');
      return;
    }
    if (!cleanName) {
      setAddManagerError('Укажите имя и фамилию сотрудника');
      return;
    }
    const currentList = isManagersInitialized
      ? editableManagers
      : settings?.managers || [];
    if (currentList.some((m) => m.id.toLowerCase() === cleanId.toLowerCase())) {
      setAddManagerError(
        `Сотрудник с ID '${cleanId}' уже присутствует в реестре`
      );
      return;
    }
    const revTargetNum = newManagerRevenueTarget.trim()
      ? parseFloat(newManagerRevenueTarget.replace(/\s+/g, ''))
      : null;

    const newEntry: ManagerConfig = {
      id: cleanId,
      name: cleanName,
      role: cleanRole,
      capacity: newManagerCapacity > 0 ? newManagerCapacity : 40,
      revenue_target:
        revTargetNum !== null && !isNaN(revTargetNum) ? revTargetNum : null,
      daily_calls_target: newManagerDailyCalls > 0 ? newManagerDailyCalls : 20,
      daily_dials_target: newManagerDailyDials > 0 ? newManagerDailyDials : 40,
      monthly_meetings_target:
        newManagerMeetings > 0 ? newManagerMeetings : 15,
      meetings_enabled: newManagerMeetingsEnabled,
      next_step_target_pct:
        newManagerNextStepPct >= 0 && newManagerNextStepPct <= 100
          ? newManagerNextStepPct
          : 80,
    };
    setEditableManagers([...currentList, newEntry]);
    setIsManagersInitialized(true);
    setIsAddingManager(false);
    setNewManagerId('');
    setNewManagerName('');
    setNewManagerRole('Менеджер ОП');
    setNewManagerRevenueTarget('');
    setNewManagerDailyCalls(20);
    setNewManagerDailyDials(40);
    setNewManagerMeetings(15);
    setNewManagerMeetingsEnabled(true);
    setNewManagerCapacity(40);
    setNewManagerNextStepPct(80);
    setAddManagerError(null);
  };

  const handleToggleModule = (code: string) => {
    setEditableModules((prev) =>
      prev.map((m) => (m.code === code ? { ...m, status: !m.status } : m))
    );
  };

  if (!tenantId) {
    return (
      <div
        className="flex min-h-[400px] flex-col items-center justify-center p-8 text-center"
        data-testid="empty-tenant-state"
      >
        <div className="mb-4 rounded-full bg-muted p-4">
          <Sliders className="h-8 w-8 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold tracking-tight">
          Тенант не выбран
        </h2>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Выберите тенант в шапке приложения для управления настройками воронки
          и интеграций.
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
      <Alert
        variant="destructive"
        className="flex items-center justify-between"
        data-testid="settings-error"
      >
        <div>
          <AlertTitle>Ошибка загрузки</AlertTitle>
          <AlertDescription>
            Не удалось загрузить настройки для тенанта {tenantId}.
          </AlertDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          className="ml-4 shrink-0"
        >
          Повторить
        </Button>
      </Alert>
    );
  }

  const general = settings?.general;
  const stages =
    editableStages.length > 0 ? editableStages : settings?.stages || [];
  const managers = isManagersInitialized
    ? editableManagers
    : settings?.managers || [];
  const telegram = settings?.telegram;
  const modules: ModuleFlag[] =
    editableModules.length > 0 ? editableModules : settings?.modules || [];

  const formattedPlan = general?.monthly_target
    ? `${general.monthly_target.toLocaleString('ru-RU')} ₽`
    : '5 000 000 ₽';
  const displayCompanyName = general?.company_name || 'RevOps Демо';

  const companyPlan = general?.monthly_target || 5000000;
  const totalPersonalPlans = managers.reduce(
    (sum, m) =>
      sum +
      (m.revenue_target && m.revenue_target > 0 ? m.revenue_target : 0),
    0
  );
  const distributionPct =
    companyPlan > 0
      ? Math.round((totalPersonalPlans / companyPlan) * 100)
      : 0;
  const remainingPlan = companyPlan - totalPersonalPlans;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Настройки
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Конфигурация регламентов, этапов воронки, уведомлений и системных
            модулей.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="border-primary/20 bg-primary/5 px-2.5 py-1 text-xs text-primary"
          >
            Тенант: {tenantId}
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            className="h-8 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
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
            <AlertDescription className="text-xs font-medium">
              {saveStatus.text}
            </AlertDescription>
          </div>
        </Alert>
      )}

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="grid h-auto w-full grid-cols-2 p-1 sm:w-auto sm:grid-cols-5">
          <TabsTrigger
            value="general"
            data-testid="tab-general"
            className="text-xs"
          >
            Общие
          </TabsTrigger>
          <TabsTrigger
            value="stages"
            data-testid="tab-stages"
            className="text-xs"
          >
            Этапы воронки
          </TabsTrigger>
          <TabsTrigger
            value="managers"
            data-testid="tab-managers"
            className="text-xs"
          >
            Менеджеры
          </TabsTrigger>
          <TabsTrigger
            value="telegram"
            data-testid="tab-telegram"
            className="text-xs"
          >
            Telegram
          </TabsTrigger>
          <TabsTrigger
            value="modules"
            data-testid="tab-modules"
            className="text-xs"
          >
            Модули
          </TabsTrigger>
        </TabsList>

        {/* ========================================================================= */}
        {/* 1. General Tab */}
        {/* ========================================================================= */}
        <TabsContent value="general" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex flex-col gap-2 text-base sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-primary" />
                  <span>Параметры компании & План продаж</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    Организация:{' '}
                    <span className="font-semibold text-foreground">
                      {displayCompanyName}
                    </span>
                  </span>
                  <span className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 font-mono text-xs font-bold text-emerald-500">
                    Утвержденный план: {formattedPlan}
                  </span>
                </div>
              </CardTitle>
              <CardDescription>
                Укажите целевой план выручки на месяц для расчета дефицита,
                процента выполнения и выявления сливов воронки.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Plan Editor Box */}
              <div className="border-primary/20 bg-primary/5 space-y-3 rounded-xl border p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <label
                      htmlFor="inputMonthlyTarget"
                      className="mb-1 block text-xs font-bold text-foreground"
                    >
                      🎯 ПЛАН ВЫРУЧКИ НА МЕСЯЦ (₽):
                    </label>
                    <p className="text-[11px] text-muted-foreground">
                      Автоматически записывается в ячейку B9 Google Таблицы
                      (лист «⚙️ Настройки»).
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
                      className="w-40 bg-background font-mono text-sm font-bold text-emerald-500"
                    />
                    <Button
                      size="sm"
                      onClick={handleSaveGeneral}
                      disabled={saveGeneralMutation.isPending}
                      className="h-9 gap-1.5 text-xs font-semibold"
                    >
                      <Save className="h-3.5 w-3.5" />
                      <span>
                        {saveGeneralMutation.isPending
                          ? 'Сохранение...'
                          : 'Сохранить план'}
                      </span>
                    </Button>
                  </div>
                </div>

                {/* Quick Presets */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-[11px] text-muted-foreground">
                    Быстрые суммы:
                  </span>
                  {[3000000, 5000000, 10000000, 15000000, 20000000].map(
                    (preset) => (
                      <Button
                        key={preset}
                        variant="outline"
                        size="sm"
                        type="button"
                        className="h-6 px-2.5 text-[11px] font-medium"
                        onClick={() => setEditTarget(String(preset))}
                      >
                        {(preset / 1000000).toFixed(0)} млн ₽
                      </Button>
                    )
                  )}
                </div>
              </div>

              {/* General Business Form */}
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
                    Реквизиты организации и расчетный период
                  </h3>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleSaveGeneral}
                    disabled={saveGeneralMutation.isPending}
                    className="border-primary/30 h-7 gap-1 text-xs text-primary"
                  >
                    <Save className="h-3 w-3" />
                    <span>Сохранить реквизиты</span>
                  </Button>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
                  <div className="space-y-1.5 rounded-md border border-subtle bg-surface p-3">
                    <Label className="text-xs text-muted-foreground">
                      Название компании
                    </Label>
                    <Input
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="RevOps Демо"
                      className="text-xs font-medium"
                    />
                  </div>

                  <div className="space-y-1.5 rounded-md border border-subtle bg-surface p-3">
                    <Label className="text-xs text-muted-foreground">
                      Валюта отчетов
                    </Label>
                    <Input
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      placeholder="RUB (₽)"
                      className="text-xs font-medium"
                    />
                  </div>

                  <div className="space-y-1.5 rounded-md border border-subtle bg-surface p-3">
                    <Label className="text-xs text-muted-foreground">
                      Месячный план (активный)
                    </Label>
                    <div className="bg-muted/30 flex h-9 items-center rounded-md border border-subtle px-3 font-mono text-xs font-bold text-emerald-500">
                      {formattedPlan}
                    </div>
                  </div>

                  <div className="space-y-1.5 rounded-md border border-subtle bg-surface p-3">
                    <Label className="text-xs text-muted-foreground">
                      Начало расчетного периода
                    </Label>
                    <Input
                      type="date"
                      value={periodStart}
                      onChange={(e) => setPeriodStart(e.target.value)}
                      className="font-mono text-xs"
                    />
                  </div>

                  <div className="space-y-1.5 rounded-md border border-subtle bg-surface p-3">
                    <Label className="text-xs text-muted-foreground">
                      Окончание расчетного периода
                    </Label>
                    <Input
                      type="date"
                      value={periodEnd}
                      onChange={(e) => setPeriodEnd(e.target.value)}
                      className="font-mono text-xs"
                    />
                  </div>

                  <div className="space-y-1.5 rounded-md border border-subtle bg-surface p-3">
                    <Label className="text-xs text-muted-foreground">
                      Дата запуска проекта
                    </Label>
                    <div className="bg-muted/30 flex h-9 items-center rounded-md border border-subtle px-3 font-mono text-xs text-foreground">
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
            <CardHeader className="flex flex-col gap-2 pb-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Clock className="h-4 w-4 text-primary" />
                  <span>Регламент этапов воронки</span>
                </CardTitle>
                <CardDescription>
                  Нормативы времени нахождения на этапе (SLA) и ожидаемая
                  вероятность конверсии.
                </CardDescription>
              </div>
              <Button
                size="sm"
                onClick={() => saveStagesMutation.mutate(stages)}
                disabled={saveStagesMutation.isPending}
                className="h-8 gap-1.5 text-xs font-semibold"
              >
                <Save className="h-3.5 w-3.5" />
                <span>
                  {saveStagesMutation.isPending
                    ? 'Сохранение...'
                    : 'Сохранить регламент этапов'}
                </span>
              </Button>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-lg border border-subtle">
                <table className="w-full text-xs">
                  <thead className="bg-subtle/50 border-b border-subtle text-muted-foreground">
                    <tr>
                      <th className="w-16 px-3 py-2.5 text-left font-medium">
                        ID
                      </th>
                      <th className="px-3 py-2.5 text-left font-medium">
                        Название этапа
                      </th>
                      <th className="w-48 px-3 py-2.5 text-left font-medium">
                        SLA регламент (ч)
                      </th>
                      <th className="w-48 px-3 py-2.5 text-left font-medium">
                        Прогноз конверсии (%)
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-subtle">
                    {stages.map((st) => (
                      <tr key={st.id} className="hover:bg-hover/50">
                        <td className="px-3 py-2.5 font-mono text-muted-foreground">
                          {st.id}
                        </td>
                        <td className="px-3 py-2.5 font-medium text-foreground">
                          {st.name}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="w-12 font-mono text-xs text-muted-foreground">
                              {st.sla_hours} ч
                            </span>
                            <Input
                              type="number"
                              min="1"
                              max="720"
                              value={st.sla_hours}
                              onChange={(e) =>
                                handleStageChange(
                                  st.id,
                                  'sla_hours',
                                  parseInt(e.target.value) || 0
                                )
                              }
                              className="h-7 w-20 font-mono text-xs"
                            />
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="w-12 font-mono text-xs font-semibold text-emerald-500">
                              {st.win_pct}%
                            </span>
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              value={st.win_pct}
                              onChange={(e) =>
                                handleStageChange(
                                  st.id,
                                  'win_pct',
                                  parseInt(e.target.value) || 0
                                )
                              }
                              className="h-7 w-20 font-mono text-xs font-semibold text-emerald-500"
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
            <CardHeader className="flex flex-col gap-2 pb-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="h-4 w-4 text-primary" />
                  <span>Реестр менеджеров и нормативы KPI</span>
                </CardTitle>
                <CardDescription>
                  Персональные планы выручки, нормативы звонков и встреч, вместимость сделок и качество Next Step.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsAddingManager(!isAddingManager);
                    setAddManagerError(null);
                  }}
                  className="h-8 gap-1.5 text-xs font-semibold"
                  data-testid="btn-add-manager"
                >
                  <UserPlus className="h-3.5 w-3.5 text-primary" />
                  <span>+ Добавить менеджера</span>
                </Button>
                <Button
                  size="sm"
                  onClick={() => saveManagersMutation.mutate(managers)}
                  disabled={saveManagersMutation.isPending}
                  className="h-8 gap-1.5 text-xs font-semibold"
                  data-testid="btn-save-managers"
                >
                  <Save className="h-3.5 w-3.5" />
                  <span>
                    {saveManagersMutation.isPending
                      ? 'Сохранение...'
                      : 'Сохранить лимиты менеджеров'}
                  </span>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Плашка распределения плана компании */}
              <div
                className={`rounded-xl border p-4 transition-all duration-150 ${
                  distributionPct >= 95 && distributionPct <= 105
                    ? 'border-emerald-500/30 bg-emerald-500/10'
                    : (distributionPct >= 70 && distributionPct < 95) ||
                      (distributionPct > 105 && distributionPct <= 120)
                    ? 'border-amber-500/30 bg-amber-500/10'
                    : 'border-rose-500/30 bg-rose-500/10'
                }`}
                data-testid="company-plan-distribution-banner"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Target className="h-4 w-4 text-foreground" />
                      <h4 className="text-sm font-bold text-foreground">
                        Распределение плана компании
                      </h4>
                      <Badge
                        variant="outline"
                        className={`text-xs font-mono font-semibold ${
                          distributionPct >= 95 && distributionPct <= 105
                            ? 'border-emerald-500 text-emerald-400'
                            : (distributionPct >= 70 && distributionPct < 95) ||
                              (distributionPct > 105 && distributionPct <= 120)
                            ? 'border-amber-500 text-amber-400'
                            : 'border-rose-500 text-rose-400'
                        }`}
                        data-testid="distribution-status-badge"
                      >
                        {distributionPct >= 95 && distributionPct <= 105
                          ? '🟢 План сбалансирован'
                          : (distributionPct >= 70 && distributionPct < 95) ||
                            (distributionPct > 105 && distributionPct <= 120)
                          ? '🟡 Частично распределён'
                          : distributionPct < 70
                          ? '🔴 Не весь план распределён по сотрудникам'
                          : '🔴 Критическое превышение плана'}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        Личные планы:{' '}
                        <strong className="font-mono text-foreground">
                          {totalPersonalPlans.toLocaleString('ru-RU')} ₽
                        </strong>{' '}
                        из{' '}
                        <strong className="font-mono text-foreground">
                          {companyPlan.toLocaleString('ru-RU')} ₽
                        </strong>
                      </span>
                      <span>&bull;</span>
                      <span>
                        Распределено:{' '}
                        <strong
                          className={`font-mono font-bold ${
                            distributionPct >= 95 && distributionPct <= 105
                              ? 'text-emerald-400'
                              : (distributionPct >= 70 && distributionPct < 95) ||
                                (distributionPct > 105 && distributionPct <= 120)
                              ? 'text-amber-400'
                              : 'text-rose-400'
                          }`}
                        >
                          {distributionPct}%
                        </strong>
                      </span>
                      <span>&bull;</span>
                      <span>
                        Остаток:{' '}
                        <strong className="font-mono text-foreground">
                          {remainingPlan > 0
                            ? `${remainingPlan.toLocaleString('ru-RU')} ₽`
                            : '0 ₽'}
                        </strong>
                      </span>
                    </div>
                  </div>
                  {/* Прогресс-бар распределения */}
                  <div className="w-full space-y-1 sm:w-48">
                    <div className="bg-subtle h-2 w-full overflow-hidden rounded-full">
                      <div
                        className={`h-full transition-all duration-300 ${
                          distributionPct >= 95 && distributionPct <= 105
                            ? 'bg-emerald-500'
                            : (distributionPct >= 70 && distributionPct < 95) ||
                              (distributionPct > 105 && distributionPct <= 120)
                            ? 'bg-amber-500'
                            : 'bg-rose-500'
                        }`}
                        style={{ width: `${Math.min(100, distributionPct)}%` }}
                      />
                    </div>
                    <div className="text-tertiary text-right font-mono text-[10px]">
                      {totalPersonalPlans.toLocaleString('ru-RU')} /{' '}
                      {companyPlan.toLocaleString('ru-RU')} ₽
                    </div>
                  </div>
                </div>
              </div>

              {isAddingManager && (
                <div
                  className="border-primary/30 bg-primary/5 space-y-3 rounded-lg border p-4"
                  data-testid="add-manager-form"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <UserPlus className="h-4 w-4 text-primary" />
                      <span>Новый менеджер в команду (с пресетами нормативов)</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setIsAddingManager(false);
                        setAddManagerError(null);
                      }}
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  {addManagerError && (
                    <div
                      className="text-xs font-medium text-rose-500"
                      data-testid="add-manager-error"
                    >
                      {addManagerError}
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
                    <div>
                      <Label className="text-xs text-muted-foreground">
                        ID (CRM или код)
                      </Label>
                      <Input
                        placeholder="например: 104 или m5"
                        value={newManagerId}
                        onChange={(e) => setNewManagerId(e.target.value)}
                        className="mt-1 h-8 font-mono text-xs"
                        data-testid="input-new-manager-id"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">
                        Имя сотрудника
                      </Label>
                      <Input
                        placeholder="Алексей Смирнов"
                        value={newManagerName}
                        onChange={(e) => setNewManagerName(e.target.value)}
                        className="mt-1 h-8 text-xs"
                        data-testid="input-new-manager-name"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">
                        Роль / Должность
                      </Label>
                      <Input
                        placeholder="Менеджер ОП / РОП"
                        value={newManagerRole}
                        onChange={(e) => setNewManagerRole(e.target.value)}
                        className="mt-1 h-8 text-xs"
                        data-testid="input-new-manager-role"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">
                        План выручки (₽/мес)
                      </Label>
                      <Input
                        type="number"
                        placeholder="— (задаётся РОПом)"
                        value={newManagerRevenueTarget}
                        onChange={(e) =>
                          setNewManagerRevenueTarget(e.target.value)
                        }
                        className="mt-1 h-8 font-mono text-xs"
                        data-testid="input-new-manager-revenue"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">
                        Звонки ≥60с / день
                      </Label>
                      <Input
                        type="number"
                        min="0"
                        max="200"
                        value={newManagerDailyCalls}
                        onChange={(e) =>
                          setNewManagerDailyCalls(
                            parseInt(e.target.value) || 0
                          )
                        }
                        className="mt-1 h-8 font-mono text-xs"
                        data-testid="input-new-manager-calls"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">
                        Наборы всего / день
                      </Label>
                      <Input
                        type="number"
                        min="0"
                        max="500"
                        value={newManagerDailyDials}
                        onChange={(e) =>
                          setNewManagerDailyDials(
                            parseInt(e.target.value) || 0
                          )
                        }
                        className="mt-1 h-8 font-mono text-xs"
                        data-testid="input-new-manager-dials"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between">
                        <Label className="text-xs text-muted-foreground">
                          Встречи / мес
                        </Label>
                        <label className="flex items-center gap-1 cursor-pointer text-[10px] text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={newManagerMeetingsEnabled}
                            onChange={(e) => setNewManagerMeetingsEnabled(e.target.checked)}
                            className="h-3 w-3 rounded border-subtle text-primary"
                            data-testid="checkbox-new-manager-meetings-enabled"
                          />
                          <span>учитывать</span>
                        </label>
                      </div>
                      <Input
                        type="number"
                        min="0"
                        max="500"
                        disabled={!newManagerMeetingsEnabled}
                        value={newManagerMeetingsEnabled ? newManagerMeetings : ''}
                        placeholder={newManagerMeetingsEnabled ? '15' : '— (Откл.)'}
                        onChange={(e) =>
                          setNewManagerMeetings(
                            parseInt(e.target.value) || 0
                          )
                        }
                        className={`mt-1 h-8 font-mono text-xs ${!newManagerMeetingsEnabled ? 'bg-muted/40 cursor-not-allowed opacity-60' : ''}`}
                        data-testid="input-new-manager-meetings"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">
                        Вместимость сделок
                      </Label>
                      <Input
                        type="number"
                        min="1"
                        max="500"
                        value={newManagerCapacity}
                        onChange={(e) =>
                          setNewManagerCapacity(
                            parseInt(e.target.value) || 0
                          )
                        }
                        className="mt-1 h-8 font-mono text-xs"
                        data-testid="input-new-manager-capacity"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">
                        Next Step, %
                      </Label>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        value={newManagerNextStepPct}
                        onChange={(e) =>
                          setNewManagerNextStepPct(
                            parseInt(e.target.value) || 0
                          )
                        }
                        className="mt-1 h-8 font-mono text-xs"
                        data-testid="input-new-manager-next-step"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setIsAddingManager(false);
                        setAddManagerError(null);
                      }}
                      className="h-8 text-xs"
                    >
                      Отмена
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleAddManagerSubmit}
                      className="h-8 gap-1.5 text-xs"
                      data-testid="btn-confirm-add-manager"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Добавить в реестр</span>
                    </Button>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto rounded-lg border border-subtle">
                <table className="w-full text-xs">
                  <thead className="bg-subtle/50 border-b border-subtle text-muted-foreground">
                    <tr>
                      <th className="min-w-[200px] px-3 py-2.5 text-left font-medium">
                        Менеджер
                      </th>
                      <th className="w-36 px-3 py-2.5 text-left font-medium">
                        План выручки
                      </th>
                      <th className="w-40 px-3 py-2.5 text-left font-medium">
                        <div className="leading-tight">
                          <span>Звонки / день</span>
                          <div className="text-[10px] font-normal text-muted-foreground">
                            ≥60с / наборы
                          </div>
                        </div>
                      </th>
                      <th className="w-32 px-3 py-2.5 text-left font-medium">
                        <div className="leading-tight">
                          <span>Встречи / мес</span>
                          <div className="text-[10px] font-normal text-muted-foreground">
                            учитывать в KPI
                          </div>
                        </div>
                      </th>
                      <th className="w-28 px-3 py-2.5 text-left font-medium">
                        Вместимость
                      </th>
                      <th className="w-24 px-3 py-2.5 text-left font-medium">
                        Next Step, %
                      </th>
                      <th className="w-16 px-3 py-2.5 text-center font-medium">
                        Действия
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-subtle">
                    {managers.map((m) => (
                      <tr
                        key={m.id}
                        className="hover:bg-hover/50"
                        data-testid={`manager-row-${m.id}`}
                      >
                        {/* 1. Менеджер: Имя + ID/Роль */}
                        <td className="px-3 py-2.5">
                          <div className="space-y-1">
                            <Input
                              type="text"
                              value={m.name}
                              onChange={(e) =>
                                handleManagerFieldChange(
                                  m.id,
                                  'name',
                                  e.target.value
                                )
                              }
                              className="h-7 text-xs font-medium"
                              data-testid={`input-manager-name-${m.id}`}
                            />
                            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                              <span className="font-mono text-[10px]">
                                ID: {m.id}
                              </span>
                              <span>&bull;</span>
                              <Input
                                type="text"
                                value={m.role}
                                onChange={(e) =>
                                  handleManagerFieldChange(
                                    m.id,
                                    'role',
                                    e.target.value
                                  )
                                }
                                className="h-5 w-32 border-transparent bg-transparent px-1 text-[11px] text-muted-foreground hover:border-subtle focus:border-primary"
                                data-testid={`input-manager-role-${m.id}`}
                              />
                            </div>
                          </div>
                        </td>

                        {/* 2. План выручки (₽) */}
                        <td className="px-3 py-2.5">
                          <div className="relative flex items-center">
                            <Input
                              type="number"
                              placeholder="—"
                              value={
                                m.revenue_target !== null &&
                                m.revenue_target !== undefined
                                  ? m.revenue_target
                                  : ''
                              }
                              onChange={(e) => {
                                const val =
                                  e.target.value.trim() === ''
                                    ? null
                                    : parseFloat(e.target.value);
                                handleManagerFieldChange(
                                  m.id,
                                  'revenue_target',
                                  val !== null && !isNaN(val) ? val : null
                                );
                              }}
                              className="h-7 w-28 pr-6 font-mono text-xs"
                              data-testid={`input-manager-revenue-${m.id}`}
                            />
                            <span className="pointer-events-none absolute right-2 text-xs text-muted-foreground">
                              ₽
                            </span>
                          </div>
                        </td>

                        {/* 3. Звонки / день: целевые (>=60с) / наборы */}
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              min="0"
                              max="200"
                              placeholder="20"
                              title="Целевых разговоров (>= 60 сек) в день"
                              value={
                                m.daily_calls_target !== null &&
                                m.daily_calls_target !== undefined
                                  ? m.daily_calls_target
                                  : ''
                              }
                              onChange={(e) => {
                                const val =
                                  e.target.value.trim() === ''
                                    ? null
                                    : parseInt(e.target.value);
                                handleManagerFieldChange(
                                  m.id,
                                  'daily_calls_target',
                                  val !== null && !isNaN(val) ? val : null
                                );
                              }}
                              className="h-7 w-14 font-mono text-xs"
                              data-testid={`input-manager-calls-${m.id}`}
                            />
                            <span className="text-muted-foreground font-mono text-xs">/</span>
                            <Input
                              type="number"
                              min="0"
                              max="500"
                              placeholder="40"
                              title="Всего наборов звонков в день"
                              value={
                                m.daily_dials_target !== null &&
                                m.daily_dials_target !== undefined
                                  ? m.daily_dials_target
                                  : ''
                              }
                              onChange={(e) => {
                                const val =
                                  e.target.value.trim() === ''
                                    ? null
                                    : parseInt(e.target.value);
                                handleManagerFieldChange(
                                  m.id,
                                  'daily_dials_target',
                                  val !== null && !isNaN(val) ? val : null
                                );
                              }}
                              className="h-7 w-14 font-mono text-xs"
                              data-testid={`input-manager-dials-${m.id}`}
                            />
                          </div>
                        </td>

                        {/* 4. Встречи / мес + чекбокс учёта */}
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <input
                              type="checkbox"
                              checked={m.meetings_enabled !== false}
                              onChange={(e) =>
                                handleManagerFieldChange(
                                  m.id,
                                  'meetings_enabled',
                                  e.target.checked
                                )
                              }
                              className="h-4 w-4 rounded border-subtle text-primary focus:ring-primary cursor-pointer"
                              title={
                                m.meetings_enabled !== false
                                  ? 'Встречи учитываются в KPI и РНП'
                                  : 'Встречи отключены (не учитываются)'
                              }
                              data-testid={`checkbox-manager-meetings-enabled-${m.id}`}
                            />
                            {m.meetings_enabled !== false ? (
                              <Input
                                type="number"
                                min="0"
                                max="500"
                                placeholder="15"
                                value={
                                  m.monthly_meetings_target !== null &&
                                  m.monthly_meetings_target !== undefined
                                    ? m.monthly_meetings_target
                                    : ''
                                }
                                onChange={(e) => {
                                  const val =
                                    e.target.value.trim() === ''
                                      ? null
                                      : parseInt(e.target.value);
                                  handleManagerFieldChange(
                                    m.id,
                                    'monthly_meetings_target',
                                    val !== null && !isNaN(val) ? val : null
                                  );
                                }}
                                className="h-7 w-16 font-mono text-xs"
                                data-testid={`input-manager-meetings-${m.id}`}
                              />
                            ) : (
                              <span className="font-mono text-xs text-muted-foreground italic">
                                — (Откл.)
                              </span>
                            )}
                          </div>
                        </td>

                        {/* 5. Вместимость */}
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <Input
                              type="number"
                              min="1"
                              max="500"
                              value={m.capacity}
                              onChange={(e) =>
                                handleManagerChange(
                                  m.id,
                                  parseInt(e.target.value) || 0
                                )
                              }
                              className="h-7 w-16 font-mono text-xs"
                              data-testid={`input-manager-capacity-${m.id}`}
                            />
                            <span className="text-[11px] text-muted-foreground">
                              сделок
                            </span>
                          </div>
                        </td>

                        {/* 6. Next Step, % */}
                        <td className="px-3 py-2.5">
                          <div className="relative flex items-center">
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              placeholder="80"
                              value={
                                m.next_step_target_pct !== null &&
                                m.next_step_target_pct !== undefined
                                  ? m.next_step_target_pct
                                  : ''
                              }
                              onChange={(e) => {
                                const val =
                                  e.target.value.trim() === ''
                                    ? null
                                    : parseInt(e.target.value);
                                handleManagerFieldChange(
                                  m.id,
                                  'next_step_target_pct',
                                  val !== null && !isNaN(val) ? val : null
                                );
                              }}
                              className="h-7 w-16 pr-5 font-mono text-xs"
                              data-testid={`input-manager-next-step-${m.id}`}
                            />
                            <span className="pointer-events-none absolute right-2 text-xs text-muted-foreground">
                              %
                            </span>
                          </div>
                        </td>

                        {/* 7. Действия */}
                        <td className="px-3 py-2.5 text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteManager(m.id)}
                            className="h-7 w-7 p-0 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-500"
                            title="Удалить сотрудника из реестра"
                            data-testid={`btn-delete-manager-${m.id}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {managers.length === 0 && (
                      <tr>
                        <td
                          colSpan={7}
                          className="py-8 text-center text-xs text-muted-foreground"
                        >
                          В реестре пока нет сотрудников. Нажмите «+ Добавить
                          менеджера», чтобы подключить сотрудника.
                        </td>
                      </tr>
                    )}
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
            <CardHeader className="flex flex-col gap-2 pb-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Send className="h-4 w-4 text-primary" />
                  <span>Интеграция с Telegram</span>
                </CardTitle>
                <CardDescription>
                  Параметры диспетчера уведомлений и каналы информирования РОПа
                  и руководства.
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
                <span>
                  {saveTelegramMutation.isPending
                    ? 'Сохранение...'
                    : 'Сохранить настройки Telegram'}
                </span>
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Security & Summary Grid */}
              <div className="grid grid-cols-1 gap-4 text-xs sm:grid-cols-2">
                {/* Bot Token - Strictly masked */}
                <div className="bg-hover/50 rounded-md border border-subtle p-3.5">
                  <span className="mb-1 block text-muted-foreground">
                    Bot Token
                  </span>
                  <span
                    className="font-mono text-sm font-bold tracking-widest text-foreground"
                    data-testid="bot-token-masked"
                  >
                    ••••••••
                  </span>
                </div>

                {/* Dispatcher Status */}
                <div className="bg-hover/50 flex items-center justify-between rounded-md border border-subtle p-3.5">
                  <div>
                    <span className="mb-1 block text-muted-foreground">
                      Статус диспетчера
                    </span>
                    <span className="font-medium text-foreground">
                      {telegram?.dispatcher_schedule || '09:00 - 21:00 MSK'}
                    </span>
                  </div>
                  <Badge variant={dispatcherStatus ? 'default' : 'secondary'}>
                    {dispatcherStatus ? 'Активен' : 'Отключен'}
                  </Badge>
                </div>

                {/* Masked Chat IDs */}
                <div className="bg-hover/50 rounded-md border border-subtle p-3.5">
                  <span className="mb-1 block text-muted-foreground">
                    РОП Chat ID
                  </span>
                  <span
                    className="font-mono font-medium text-foreground"
                    data-testid="rop-chat-id"
                  >
                    {maskChatId(telegram?.rop_chat_id)}
                  </span>
                </div>

                <div className="bg-hover/50 rounded-md border border-subtle p-3.5">
                  <span className="mb-1 block text-muted-foreground">
                    CEO Chat ID
                  </span>
                  <span
                    className="font-mono font-medium text-foreground"
                    data-testid="ceo-chat-id"
                  >
                    {maskChatId(telegram?.ceo_chat_id)}
                  </span>
                </div>

                <div className="bg-hover/50 rounded-md border border-subtle p-3.5">
                  <span className="mb-1 block text-muted-foreground">
                    Team Chat ID
                  </span>
                  <span
                    className="font-mono font-medium text-foreground"
                    data-testid="team-chat-id"
                  >
                    {maskChatId(telegram?.team_chat_id)}
                  </span>
                </div>
              </div>

              {/* Telegram Form Editor */}
              <div className="space-y-3 border-t border-subtle pt-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
                  Редактирование каналов оповещения
                </h3>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-secondary">
                      РОП Chat ID
                    </Label>
                    <Input
                      placeholder="-1001234567890"
                      value={ropChatId}
                      onChange={(e) => setRopChatId(e.target.value)}
                      className="font-mono text-xs"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-secondary">
                      CEO Chat ID
                    </Label>
                    <Input
                      placeholder="-1009876543210"
                      value={ceoChatId}
                      onChange={(e) => setCeoChatId(e.target.value)}
                      className="font-mono text-xs"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-secondary">
                      Team Chat ID
                    </Label>
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
                    <span className="text-xs text-muted-foreground">
                      Диспетчер утренней сводки (09:15):
                    </span>
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
            <CardHeader className="flex flex-col gap-2 pb-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
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
                <span>
                  {saveModulesMutation.isPending
                    ? 'Сохранение...'
                    : 'Применить конфигурацию модулей'}
                </span>
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-3" data-testid="modules-list">
                {modules.map((mod) => (
                  <div
                    key={mod.code}
                    className="bg-hover/50 flex items-center justify-between rounded-md border border-subtle p-3.5"
                    data-testid={`module-${mod.code}`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-semibold text-foreground">
                          {mod.name}
                        </span>
                        <span className="font-mono text-[10px] uppercase text-muted-foreground">
                          [{mod.code}]
                        </span>
                        <Badge variant="outline" className="text-[10px]">
                          {mod.category}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {mod.description}
                      </p>
                    </div>

                    <div className="ml-4 flex shrink-0 items-center gap-2">
                      {mod.status ? (
                        <Badge
                          variant="secondary"
                          className="flex items-center space-x-1 border-emerald-500/20 bg-emerald-500/10 text-emerald-500"
                          data-testid={`module-status-${mod.code}`}
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          <span>Активен</span>
                        </Badge>
                      ) : (
                        <Badge
                          variant="secondary"
                          className="flex items-center space-x-1 text-muted-foreground"
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
                        className="h-7 px-2 text-xs"
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

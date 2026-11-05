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

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
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
  ShieldCheck,
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

// The server answers "partial_ok" when the settings are saved in the cabinet but the Google Sheet write failed:
// the banner must say that, not "synchronized".
function savedStatus(
  result: { save_status?: string },
  okText: string
): { text: string; type: 'success' | 'warning' } {
  if (result.save_status === 'partial_ok') {
    return {
      text: '⚠ Сохранено в личном кабинете, но записать в Google Таблицу не удалось. Повторите сохранение позже.',
      type: 'warning',
    };
  }
  return { text: okText, type: 'success' };
}

// The API client rejects with { detail, status_code } (detail is a string, or a list for a 422), not with an Error:
// reading err.message printed "…: undefined" for every failed save.
function errorText(err: unknown): string {
  const detail = (err as { detail?: unknown } | null)?.detail;
  if (typeof detail === 'string' && detail) return detail;
  if (Array.isArray(detail)) {
    return 'Проверьте значения полей: одно из них вне допустимых пределов.';
  }
  return (err as Error | null)?.message || 'Неизвестная ошибка';
}

// type="number" answers "" for text like "12e", and the page took that for "empty" and saved a plan of 0.
// The money fields are plain text now and parsed strictly: null = empty, 'bad' = not a plain number.
function parseMoney(raw: string): number | null | 'bad' {
  const t = raw.replace(/[\s ]/g, '');
  if (t === '') return null;
  if (!/^\d+([.,]\d+)?$/.test(t)) return 'bad';
  return parseFloat(t.replace(',', '.'));
}

// Numeric ids are issued by the CRM: the import deletes the numeric ids it does not find, so a hand-made employee
// must have a code like m5.
const isCrmId = (id: string) => /^\d+$/.test(id);

function validateManagers(list: ManagerConfig[]): string | null {
  const inRange = (v: number | null | undefined, lo: number, hi: number) =>
    v === null || v === undefined || (v >= lo && v <= hi);
  for (const m of list) {
    const who = m.name || m.id;
    if (!(m.capacity >= 1 && m.capacity <= 500)) return `${who}: вместимость должна быть от 1 до 500 сделок`;
    if (!inRange(m.revenue_target, 0, 1e12)) return `${who}: план выручки не может быть отрицательным`;
    if (!inRange(m.daily_calls_target, 0, 200)) return `${who}: звонков в день — от 0 до 200`;
    if (!inRange(m.daily_dials_target, 0, 500)) return `${who}: наборов в день — от 0 до 500`;
    if (!inRange(m.monthly_meetings_target, 0, 500)) return `${who}: встреч в месяц — от 0 до 500`;
    if (!inRange(m.next_step_target_pct, 0, 100)) return `${who}: Next Step — от 0 до 100%`;
  }
  return null;
}

function maskChatId(id?: string): string {
  if (!id) return '—';
  if (id.length <= 4) return '••••';
  return `••••${id.slice(-4)}`;
}

// Stages (SLA / win %), Telegram chat IDs and the 19 modules are saved but nothing reads them yet: a client must not
// configure switches that do nothing. The tabs come back with VITE_SHOW_UNFINISHED_SETTINGS=true (read at render).
function showUnfinishedTabs(): boolean {
  return import.meta.env.VITE_SHOW_UNFINISHED_SETTINGS === 'true';
}

export function SettingsPage() {
  const tenantId = useActiveTenantSafe();
  const showUnfinished = showUnfinishedTabs();
  const queryClient = useQueryClient();

  const {
    data: settings,
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ['settings', tenantId],
    queryFn: () => settingsApi.get(tenantId!),
    enabled: Boolean(tenantId),
  });

  // Local form states
  const [editTarget, setEditTarget] = useState<string>('');
  const [editAvgCheck, setEditAvgCheck] = useState<string>('');
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
  const [newManagerRevenueTarget, setNewManagerRevenueTarget] =
    useState<string>('');
  const [newManagerDailyCalls, setNewManagerDailyCalls] = useState<number>(20);
  const [newManagerDailyDials, setNewManagerDailyDials] = useState<number>(40);
  const [newManagerMeetings, setNewManagerMeetings] = useState<number>(15);
  const [newManagerMeetingsEnabled, setNewManagerMeetingsEnabled] =
    useState<boolean>(true);
  const [newManagerCapacity, setNewManagerCapacity] = useState<number>(40);
  const [newManagerNextStepPct, setNewManagerNextStepPct] =
    useState<number>(80);
  const [addManagerError, setAddManagerError] = useState<string | null>(null);
  const [ropChatId, setRopChatId] = useState<string>('');
  const [ceoChatId, setCeoChatId] = useState<string>('');
  const [teamChatId, setTeamChatId] = useState<string>('');
  const [dispatcherStatus, setDispatcherStatus] = useState<boolean>(true);
  const [allowCrmMutations, setAllowCrmMutations] = useState<boolean>(false);
  const [enableTelegramNotifications, setEnableTelegramNotifications] = useState<boolean>(false);
  const [allowClientCommunication, setAllowClientCommunication] = useState<boolean>(false);
  const [editableModules, setEditableModules] = useState<ModuleFlag[]>([]);
  const [hasAutoSynced, setHasAutoSynced] = useState<boolean>(false);

  // Unsaved edits per block: a refetch (the save of another block, a websocket event) must not overwrite them
  const [planDirty, setPlanDirty] = useState(false);
  const [checkDirty, setCheckDirty] = useState(false);
  const [reqDirty, setReqDirty] = useState(false);
  const [managersDirty, setManagersDirty] = useState(false);
  const [autonomyDirty, setAutonomyDirty] = useState(false);
  const [confirmEnable, setConfirmEnable] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const hasUnsaved = planDirty || checkDirty || reqDirty || managersDirty || autonomyDirty;

  // Feedback banner: ONE timer, so that a success never wipes a newer message. An error stays until it is closed,
  // a warning (the sheet was not written) stays long enough to be read.
  type SaveStatus = { text: string; type: 'success' | 'warning' | 'error' };
  const [saveStatus, setSaveStatusRaw] = useState<SaveStatus | null>(null);
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setSaveStatus = (next: SaveStatus | null) => {
    if (statusTimer.current) clearTimeout(statusTimer.current);
    setSaveStatusRaw(next);
    if (next && next.type !== 'error') {
      statusTimer.current = setTimeout(
        () => setSaveStatusRaw(null),
        next.type === 'success' ? 4000 : 12000
      );
    }
  };

  // Sync state from query data
  useEffect(() => {
    if (settings) {
      if (settings.general) {
        if (!reqDirty) {
          setCompanyName(settings.general.company_name || '');
          setCurrency(settings.general.currency || 'RUB (₽)');
          setPeriodStart(settings.general.period_start || '');
          setPeriodEnd(settings.general.period_end || '');
        }
        // 0 / missing = no plan set: the field stays empty (nothing is assumed)
        if (!planDirty) {
          setEditTarget(
            settings.general.monthly_target && settings.general.monthly_target > 0
              ? String(settings.general.monthly_target)
              : ''
          );
        }
        if (!checkDirty) {
          setEditAvgCheck(
            settings.general.avg_deal_check ? String(settings.general.avg_deal_check) : ''
          );
        }
      }
      if (settings.stages && settings.stages.length > 0) {
        setEditableStages(settings.stages);
      }
      if (settings.managers && !managersDirty) {
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
      if (settings.autonomy && !autonomyDirty) {
        setAllowCrmMutations(Boolean(settings.autonomy.allow_crm_mutations));
        setEnableTelegramNotifications(Boolean(settings.autonomy.enable_telegram_notifications));
        setAllowClientCommunication(Boolean(settings.autonomy.allow_client_communication));
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
      avg_deal_check?: number | null;
    }) => settingsApi.updateGeneral(tenantId!, payload),
    onSuccess: (saved, vars) => {
      // only the blocks that were really sent are saved now: the other blocks keep their unsaved edits
      if ('monthly_target' in vars) setPlanDirty(false);
      if ('avg_deal_check' in vars) setCheckDirty(false);
      if ('company_name' in vars || 'currency' in vars || 'period_start' in vars) setReqDirty(false);
      setSaveStatus(
        savedStatus(
          saved,
          'monthly_target' in vars
            ? '✓ План выручки сохранён'
            : 'avg_deal_check' in vars
              ? '✓ Средний чек сохранён'
              : '✓ Реквизиты компании сохранены'
        )
      );
      queryClient.invalidateQueries({ queryKey: ['settings', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['insights', tenantId] });
    },
    onError: (err: Error) => {
      setSaveStatus({
        text: `Ошибка сохранения параметров: ${errorText(err)}`,
        type: 'error',
      });
    },
  });

  const saveStagesMutation = useMutation({
    mutationFn: (stages: StageConfig[]) =>
      settingsApi.updateStages(tenantId!, stages),
    onSuccess: (saved) => {
      setSaveStatus(savedStatus(saved, '✓ Регламент этапов воронки (SLA и конверсия) успешно сохранен!'));
      queryClient.invalidateQueries({ queryKey: ['settings', tenantId] });
    },
    onError: (err: Error) => {
      setSaveStatus({
        text: `Ошибка сохранения регламента этапов: ${errorText(err)}`,
        type: 'error',
      });
    },
  });

  const saveManagersMutation = useMutation({
    mutationFn: (managers: ManagerConfig[]) =>
      settingsApi.updateManagers(tenantId!, managers),
    onSuccess: (saved) => {
      setManagersDirty(false);
      setSaveStatus(savedStatus(saved, '✓ Лимиты и вместимость менеджеров успешно сохранены!'));
      queryClient.invalidateQueries({ queryKey: ['settings', tenantId] });
    },
    onError: (err: Error) => {
      setSaveStatus({
        text: `Ошибка сохранения менеджеров: ${errorText(err)}`,
        type: 'error',
      });
    },
  });

  const syncCrmManagersMutation = useMutation({
    mutationFn: (silent: boolean = false) =>
      settingsApi.syncCrmManagers(tenantId!, silent),
    onSuccess: (data, silent) => {
      // "skipped": the server did nothing, so the table the user may be editing must stay as it is
      if (data.status === 'skipped') return;
      queryClient.invalidateQueries({ queryKey: ['settings', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['managers', tenantId] });
      if (data.managers && Array.isArray(data.managers)) {
        setEditableManagers(data.managers);
        setIsManagersInitialized(true);
      }
      if (data.added_count > 0) {
        setSaveStatus({
          text: `✓ ${data.message || `Импортировано новых сотрудников: ${data.added_count}`}`,
          type: 'success',
        });
      } else if (!silent) {
        setSaveStatus({
          text:
            data.message ||
            'Все сотрудники из CRM уже синхронизированы в реестре.',
          type: 'success',
        });
      }
    },
    onError: (err: Error, silent) => {
      if (!silent) {
        setSaveStatus({
          text: `Ошибка синхронизации с CRM: ${errorText(err)}`,
          type: 'error',
        });
      }
    },
  });

  // Another company was chosen: the unsaved edits and the "already synced" flag of the previous one must not stay
  useEffect(() => {
    setHasAutoSynced(false);
    setIsManagersInitialized(false);
    setPlanDirty(false);
    setCheckDirty(false);
    setReqDirty(false);
    setManagersDirty(false);
    setAutonomyDirty(false);
    setConfirmEnable(false);
    setConfirmDeleteId(null);
  }, [tenantId]);

  // Auto-sync managers from CRM once on page load
  useEffect(() => {
    if (tenantId && !hasAutoSynced) {
      setHasAutoSynced(true);
      syncCrmManagersMutation.mutate(true);
    }
  }, [tenantId, hasAutoSynced]);

  // Leaving the page with unsaved edits: the browser asks first
  useEffect(() => {
    if (!hasUnsaved) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasUnsaved]);

  const saveTelegramMutation = useMutation({
    mutationFn: (telegramPayload: {
      rop_chat_id?: string;
      ceo_chat_id?: string;
      team_chat_id?: string;
      dispatcher_status?: boolean;
    }) => settingsApi.updateTelegram(tenantId!, telegramPayload),
    onSuccess: (saved) => {
      setSaveStatus(savedStatus(saved, '✓ Конфигурация Telegram-уведомлений успешно сохранена!'));
      queryClient.invalidateQueries({ queryKey: ['settings', tenantId] });
    },
    onError: (err: Error) => {
      setSaveStatus({
        text: `Ошибка сохранения настроек Telegram: ${errorText(err)}`,
        type: 'error',
      });
    },
  });

  const saveAutonomyMutation = useMutation({
    mutationFn: (autonomyPayload: {
      allow_crm_mutations: boolean;
      enable_telegram_notifications: boolean;
      allow_client_communication: boolean;
    }) => settingsApi.updateAutonomy(tenantId!, autonomyPayload),
    onSuccess: () => {
      setAutonomyDirty(false);
      setConfirmEnable(false);
      setSaveStatus({
        text: '✓ Параметры автономии и вмешательства ИИ успешно сохранены!',
        type: 'success',
      });
      queryClient.invalidateQueries({ queryKey: ['settings', tenantId] });
    },
    onError: (err: Error) => {
      setSaveStatus({
        text: `Ошибка сохранения параметров автономии: ${errorText(err)}`,
        type: 'error',
      });
    },
  });

  const saveModulesMutation = useMutation({
    mutationFn: (modules: ModuleFlag[]) =>
      settingsApi.updateModules(tenantId!, modules),
    onSuccess: (saved) => {
      setSaveStatus(savedStatus(saved, '✓ Настройки системных модулей сохранены!'));
      queryClient.invalidateQueries({ queryKey: ['settings', tenantId] });
    },
    onError: (err: Error) => {
      setSaveStatus({
        text: `Ошибка обновления модулей: ${errorText(err)}`,
        type: 'error',
      });
    },
  });

  // Handlers
  // The plan is saved on its own: it used to travel together with the company name, the period and the currency
  const handleSavePlan = () => {
    // An empty field clears the plan (0 = not set); a plain number of rubles otherwise
    const target = parseMoney(editTarget);
    if (target === 'bad') {
      setSaveStatus({
        text: 'Введите сумму плана цифрами, например 3000000 (или оставьте поле пустым)',
        type: 'error',
      });
      return;
    }
    setSaveStatus(null);
    saveGeneralMutation.mutate({ monthly_target: target ?? 0 });
  };

  // Average deal check: empty clears it (nothing is assumed), otherwise a positive number of rubles
  const handleSaveAvgCheck = () => {
    const val = parseMoney(editAvgCheck);
    if (val === 'bad' || (val !== null && val <= 0)) {
      setSaveStatus({
        text: 'Введите средний чек сделки положительным числом в рублях (или оставьте поле пустым)',
        type: 'error',
      });
      return;
    }
    setSaveStatus(null);
    saveGeneralMutation.mutate({ avg_deal_check: val });
  };

  const handleSaveRequisites = () => {
    if (!companyName.trim()) {
      setSaveStatus({ text: 'Укажите название компании', type: 'error' });
      return;
    }
    if (periodStart && periodEnd && periodEnd < periodStart) {
      setSaveStatus({ text: 'Конец расчётного периода раньше его начала', type: 'error' });
      return;
    }
    setSaveStatus(null);
    // empty period fields are sent as empty strings: that is how the client clears a period
    saveGeneralMutation.mutate({
      company_name: companyName.trim(),
      currency: currency.trim() || undefined,
      period_start: periodStart.trim(),
      period_end: periodEnd.trim(),
    });
  };

  // The import would replace the table, so the edits that are not saved yet must not be lost by it
  const runImport = () => {
    if (managersDirty) {
      setSaveStatus({
        text: 'Сначала сохраните изменения в таблице менеджеров, затем повторите импорт: иначе они потеряются.',
        type: 'warning',
      });
      return;
    }
    syncCrmManagersMutation.mutate(false);
  };

  const handleSaveManagers = () => {
    const problem = validateManagers(managers);
    if (problem) {
      setSaveStatus({ text: problem, type: 'error' });
      return;
    }
    saveManagersMutation.mutate(managers);
  };

  // Turning the CRM writes ON needs a second click: the AI starts creating tasks and filling deal fields
  const handleSaveAutonomy = () => {
    const savedOn = Boolean(settings?.autonomy?.allow_crm_mutations);
    if (allowCrmMutations && !savedOn && !confirmEnable) {
      setConfirmEnable(true);
      return;
    }
    setConfirmEnable(false);
    saveAutonomyMutation.mutate({
      allow_crm_mutations: allowCrmMutations,
      enable_telegram_notifications: enableTelegramNotifications,
      allow_client_communication: allowClientCommunication,
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
    setManagersDirty(true);
  };

  const handleManagerChange = (id: string, capacity: number) => {
    handleManagerFieldChange(id, 'capacity', capacity);
  };

  // Deleting a person takes two clicks: the first asks "Удалить?" for four seconds
  const handleDeleteManager = (id: string) => {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      setTimeout(() => setConfirmDeleteId((cur) => (cur === id ? null : cur)), 4000);
      return;
    }
    setConfirmDeleteId(null);
    setEditableManagers((prev) => {
      const base = isManagersInitialized ? prev : settings?.managers || [];
      return base.filter((m) => m.id !== id);
    });
    setIsManagersInitialized(true);
    setManagersDirty(true);
  };

  const handleAddManagerSubmit = () => {
    const cleanId = newManagerId.trim();
    const cleanName = newManagerName.trim();
    const cleanRole = newManagerRole.trim() || 'Менеджер ОП';

    if (!cleanId) {
      setAddManagerError('Укажите код сотрудника (например: m5)');
      return;
    }
    if (isCrmId(cleanId)) {
      setAddManagerError(
        'Числовые ID выдаёт CRM, их подтягивает импорт. Для сотрудника, добавленного вручную, используйте код вида m5'
      );
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
      monthly_meetings_target: newManagerMeetings > 0 ? newManagerMeetings : 15,
      meetings_enabled: newManagerMeetingsEnabled,
      next_step_target_pct:
        newManagerNextStepPct >= 0 && newManagerNextStepPct <= 100
          ? newManagerNextStepPct
          : 80,
    };
    setEditableManagers([...currentList, newEntry]);
    setIsManagersInitialized(true);
    setManagersDirty(true);
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
          Компания не выбрана
        </h2>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Выберите компанию в шапке приложения, чтобы управлять её настройками.
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
            Не удалось загрузить настройки компании {tenantId}.
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
  const savedCrm = Boolean(settings?.autonomy?.allow_crm_mutations);
  const modules: ModuleFlag[] =
    editableModules.length > 0 ? editableModules : settings?.modules || [];

  const crmType = (settings?.crm_type || '').toLowerCase();
  const crmLabel =
    crmType === 'amocrm' || crmType === 'amo'
      ? 'Импортировать из amoCRM'
      : crmType === 'bitrix24' || crmType === 'b24'
        ? 'Импортировать из Битрикс24'
        : 'Импортировать из amoCRM / Битрикс24';

  const displayCompanyName = general?.company_name || 'Ваша компания';

  const companyPlan = general?.monthly_target || 0;
  const totalPersonalPlans = managers.reduce(
    (sum, m) =>
      sum + (m.revenue_target && m.revenue_target > 0 ? m.revenue_target : 0),
    0
  );
  const distributionPct =
    companyPlan > 0 ? Math.round((totalPersonalPlans / companyPlan) * 100) : 0;
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
            {showUnfinished
              ? 'Конфигурация регламентов, этапов воронки, уведомлений и системных модулей.'
              : 'План и реквизиты компании, команда с нормативами и режим вмешательства ИИ.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hasUnsaved && (
            <span
              className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-700 dark:text-amber-400"
              data-testid="unsaved-changes"
            >
              Есть несохранённые изменения
            </span>
          )}
          <Badge
            variant="outline"
            className="max-w-[16rem] truncate border-primary/20 bg-primary/5 px-2.5 py-1 text-xs text-primary"
            title={`${displayCompanyName} (${tenantId})`}
          >
            Компания: {displayCompanyName}
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-8 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
            title="Перечитать настройки с сервера. Несохранённые правки в формах не затираются."
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            <span>{isFetching ? 'Обновление...' : 'Обновить'}</span>
          </Button>
        </div>
      </div>

      {/* Global save feedback alert */}
      {saveStatus && (
        <Alert
          className={`py-2.5 ${
            saveStatus.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
              : saveStatus.type === 'warning'
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400'
                : 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400'
          }`}
        >
          <div className="flex items-center gap-2">
            {saveStatus.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400" />
            ) : saveStatus.type === 'warning' ? (
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
            ) : (
              <XCircle className="h-4 w-4 shrink-0 text-rose-700 dark:text-rose-400" />
            )}
            <AlertDescription className="flex-1 text-xs font-medium">
              {saveStatus.text}
            </AlertDescription>
            <button
              type="button"
              onClick={() => setSaveStatus(null)}
              aria-label="Закрыть сообщение"
              className="shrink-0 rounded p-0.5 opacity-70 hover:opacity-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </Alert>
      )}

      <Tabs defaultValue="general" className="w-full">
        <TabsList
          className={`grid h-auto w-full p-1 sm:w-auto ${
            showUnfinished ? 'grid-cols-2 sm:grid-cols-6' : 'grid-cols-3'
          }`}
        >
          <TabsTrigger
            value="general"
            data-testid="tab-general"
            className="text-xs"
          >
            Общие
          </TabsTrigger>
          <TabsTrigger
            value="autonomy"
            data-testid="tab-autonomy"
            className="text-xs"
          >
            Автономия ИИ
          </TabsTrigger>
          {showUnfinished && (
            <TabsTrigger
              value="stages"
              data-testid="tab-stages"
              className="text-xs"
            >
              Этапы воронки
            </TabsTrigger>
          )}
          <TabsTrigger
            value="managers"
            data-testid="tab-managers"
            className="text-xs"
          >
            Менеджеры
          </TabsTrigger>
          {showUnfinished && (
            <TabsTrigger
              value="telegram"
              data-testid="tab-telegram"
              className="text-xs"
            >
              Telegram
            </TabsTrigger>
          )}
          {showUnfinished && (
            <TabsTrigger
              value="modules"
              data-testid="tab-modules"
              className="text-xs"
            >
              Модули
            </TabsTrigger>
          )}
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
                  <span>Параметры компании и план продаж</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    Организация:{' '}
                    <span className="font-semibold text-foreground">
                      {displayCompanyName}
                    </span>
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
                      ПЛАН ВЫРУЧКИ НА МЕСЯЦ (₽):
                    </label>
                    <p className="text-xs text-muted-foreground">
                      Пусто — план не задан.
                    </p>
                  </div>
                  <form
                    className="flex items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSavePlan();
                    }}
                  >
                    <Input
                      id="inputMonthlyTarget"
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      value={editTarget}
                      onChange={(e) => {
                        setEditTarget(e.target.value);
                        setPlanDirty(true);
                      }}
                      placeholder="не задан"
                      className="w-40 bg-background font-mono text-sm font-bold text-emerald-700 dark:text-emerald-500"
                    />
                    <Button
                      type="submit"
                      size="sm"
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
                  </form>
                </div>

                {/* Quick plan presets: they fill the PLAN field above, so they sit right under it */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    Быстрые суммы для плана:
                  </span>
                  {[3000000, 5000000, 10000000, 15000000, 20000000].map(
                    (preset) => (
                      <Button
                        key={preset}
                        variant="outline"
                        size="sm"
                        type="button"
                        className="h-6 px-2.5 text-xs font-medium"
                        onClick={() => {
                          setEditTarget(String(preset));
                          setPlanDirty(true);
                        }}
                      >
                        {(preset / 1000000).toFixed(0)} млн ₽
                      </Button>
                    )
                  )}
                </div>

                {/* Average deal check: set by the client, used for revenue-at-risk estimates */}
                <div
                  className="flex flex-col gap-3 border-t border-subtle pt-3 sm:flex-row sm:items-center sm:justify-between"
                  data-testid="avg-check-editor"
                >
                  <div>
                    <label
                      htmlFor="inputAvgDealCheck"
                      className="mb-1 block text-xs font-bold text-foreground"
                    >
                      СРЕДНИЙ ЧЕК СДЕЛКИ (₽):
                    </label>
                    <p className="text-xs text-muted-foreground">
                      Нужен для оценки потерь и сценариев. Пусто — значение не задано, ничего не предполагается.
                    </p>
                  </div>
                  <form
                    className="flex items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSaveAvgCheck();
                    }}
                  >
                    <Input
                      id="inputAvgDealCheck"
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      value={editAvgCheck}
                      onChange={(e) => {
                        setEditAvgCheck(e.target.value);
                        setCheckDirty(true);
                      }}
                      placeholder="не задан"
                      className="w-40 bg-background font-mono text-sm font-bold"
                    />
                    <Button
                      type="submit"
                      size="sm"
                      disabled={saveGeneralMutation.isPending}
                      className="h-9 gap-1.5 text-xs font-semibold"
                      data-testid="btn-save-avg-check"
                    >
                      <Save className="h-3.5 w-3.5" />
                      <span>Сохранить чек</span>
                    </Button>
                  </form>
                </div>

              </div>

              {/* Requisites. Currency, the period and the project start are not read by any calculation, so a client
                  does not see them (they stay behind the same flag as the unfinished tabs). */}
              <form
                className="space-y-3 pt-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSaveRequisites();
                }}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
                    {showUnfinished
                      ? 'Реквизиты организации и расчётный период'
                      : 'Реквизиты организации'}
                  </h3>
                  <Button
                    type="submit"
                    size="sm"
                    variant="outline"
                    disabled={saveGeneralMutation.isPending}
                    className="border-primary/30 h-7 gap-1 text-xs text-primary"
                  >
                    <Save className="h-3 w-3" />
                    <span>Сохранить реквизиты</span>
                  </Button>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
                  <div className="space-y-1.5 rounded-md border border-subtle bg-surface p-3">
                    <Label htmlFor="inputCompanyName" className="text-xs text-muted-foreground">
                      Название компании
                    </Label>
                    <Input
                      id="inputCompanyName"
                      value={companyName}
                      onChange={(e) => {
                        setCompanyName(e.target.value);
                        setReqDirty(true);
                      }}
                      placeholder="Название вашей компании"
                      className="text-xs font-medium"
                    />
                  </div>

                  {showUnfinished && (
                    <>
                      <div className="space-y-1.5 rounded-md border border-subtle bg-surface p-3">
                        <Label htmlFor="inputCurrency" className="text-xs text-muted-foreground">
                          Валюта отчетов
                        </Label>
                        <Input
                          id="inputCurrency"
                          value={currency}
                          onChange={(e) => {
                            setCurrency(e.target.value);
                            setReqDirty(true);
                          }}
                          placeholder="RUB (₽)"
                          className="text-xs font-medium"
                        />
                      </div>

                      <div className="space-y-1.5 rounded-md border border-subtle bg-surface p-3">
                        <Label htmlFor="inputPeriodStart" className="text-xs text-muted-foreground">
                          Начало расчетного периода
                        </Label>
                        <Input
                          id="inputPeriodStart"
                          type="date"
                          value={periodStart}
                          onChange={(e) => {
                            setPeriodStart(e.target.value);
                            setReqDirty(true);
                          }}
                          className="font-mono text-xs"
                        />
                      </div>

                      <div className="space-y-1.5 rounded-md border border-subtle bg-surface p-3">
                        <Label htmlFor="inputPeriodEnd" className="text-xs text-muted-foreground">
                          Окончание расчетного периода
                        </Label>
                        <Input
                          id="inputPeriodEnd"
                          type="date"
                          value={periodEnd}
                          onChange={(e) => {
                            setPeriodEnd(e.target.value);
                            setReqDirty(true);
                          }}
                          className="font-mono text-xs"
                        />
                      </div>

                      <div className="space-y-1.5 rounded-md border border-subtle bg-surface p-3">
                        <Label className="text-xs text-muted-foreground">
                          Дата запуска проекта
                        </Label>
                        <div className="bg-muted/30 flex h-9 items-center rounded-md border border-subtle px-3 font-mono text-xs text-foreground">
                          {general?.project_start_date || '—'}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ========================================================================= */}
        {/* 2. Stages Tab */}
        {/* ========================================================================= */}
        <TabsContent value="autonomy" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    <span>Автономия ИИ и режим вмешательства в CRM</span>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Что ИИ может делать в вашей CRM сам. По умолчанию включён пассивный режим.
                  </CardDescription>
                </div>
                {/* the badge shows what is SAVED, not the unsaved tick of the switch */}
                <Badge
                  variant={savedCrm ? "default" : "outline"}
                  className="w-fit text-xs"
                >
                  {savedCrm ? "🟢 Автономный режим" : "🔒 Безопасный пассивный режим"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-6 pt-2">
              <div className="space-y-4 rounded-lg border border-subtle bg-muted/20 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="crm-mutations-toggle" className="text-sm font-semibold cursor-pointer">
                      Задачи и поля сделок в CRM (amoCRM / Bitrix24)
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {allowCrmMutations
                        ? "ВКЛЮЧЕНО: ИИ создаёт задачи менеджерам и заполняет поля сделки (оценка звонка, следующий шаг) в вашей CRM."
                        : "🔒 ВЫКЛЮЧЕНО (по умолчанию): ИИ не создаёт задачи и не заполняет поля сделок. Разбор звонка по-прежнему добавляется в сделку примечанием."}
                    </p>
                  </div>
                  <input
                    id="crm-mutations-toggle"
                    data-testid="crm-mutations-toggle"
                    type="checkbox"
                    checked={allowCrmMutations}
                    onChange={(e) => {
                      setAllowCrmMutations(e.target.checked);
                      setAutonomyDirty(true);
                      setConfirmEnable(false);
                    }}
                    className="h-5 w-5 rounded border-subtle text-primary cursor-pointer accent-primary"
                  />
                </div>

                {allowCrmMutations !== savedCrm && (
                  <p className="text-xs font-medium text-amber-700 dark:text-amber-400" data-testid="autonomy-unsaved-note">
                    Изменение вступит в силу только после сохранения.
                  </p>
                )}
                {confirmEnable && (
                  <p className="text-xs font-semibold text-rose-700 dark:text-rose-400" data-testid="autonomy-confirm-note">
                    Подтвердите: ИИ начнёт создавать задачи менеджерам и заполнять поля сделок в вашей CRM.
                  </p>
                )}

                {/* Telegram approvals and client messaging belong to the agent engine that no production flow calls yet */}
                {showUnfinished && (
                <div className="border-t border-subtle pt-4 flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="telegram-notifications-toggle" className="text-sm font-semibold cursor-pointer">
                      2. Оповещения и согласования в Telegram (HITL)
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {enableTelegramNotifications
                        ? "ВКЛЮЧЕНО: Карточки подтверждения рискованных действий отправляются РОПу в Telegram."
                        : "🔕 ВЫКЛЮЧЕНО (Тихий режим): Никаких сообщений в Telegram не отправляется. Согласования отображаются только в веб-очереди ЛК."}
                    </p>
                  </div>
                  <input
                    id="telegram-notifications-toggle"
                    data-testid="telegram-notifications-toggle"
                    type="checkbox"
                    checked={enableTelegramNotifications}
                    onChange={(e) => {
                      setEnableTelegramNotifications(e.target.checked);
                      setAutonomyDirty(true);
                    }}
                    className="h-5 w-5 rounded border-subtle text-primary cursor-pointer accent-primary"
                  />
                </div>
                )}

                {showUnfinished && (
                <div className="border-t border-subtle pt-4 flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="client-communication-toggle" className="text-sm font-semibold cursor-pointer">
                      3. Прямая коммуникация с клиентами
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {allowClientCommunication
                        ? "ВКЛЮЧЕНО: ИИ разрешено отправлять согласованные сообщения клиентам."
                        : "🛑 ВЫКЛЮЧЕНО (По умолчанию): ИИ генерирует только черновики ответов для менеджера. Прямая отправка во внешние чаты заблокирована."}
                    </p>
                  </div>
                  <input
                    id="client-communication-toggle"
                    data-testid="client-communication-toggle"
                    type="checkbox"
                    checked={allowClientCommunication}
                    onChange={(e) => {
                      setAllowClientCommunication(e.target.checked);
                      setAutonomyDirty(true);
                    }}
                    className="h-5 w-5 rounded border-subtle text-primary cursor-pointer accent-primary"
                  />
                </div>
                )}
              </div>

              <div className="flex justify-end">
                <Button
                  data-testid="save-autonomy-btn"
                  size="sm"
                  disabled={saveAutonomyMutation.isPending}
                  onClick={handleSaveAutonomy}
                  className="gap-2"
                >
                  <Save className="h-4 w-4" />
                  <span>{confirmEnable ? 'Подтвердить включение' : 'Сохранить параметры автономии'}</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

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
                            <span className="w-12 font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-500">
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
                              className="h-7 w-20 font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-500"
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
                  <span>Команда и нормативы</span>
                </CardTitle>
                <CardDescription>
                  Персональные планы выручки, нормативы звонков и встреч,
                  вместимость сделок и качество Next Step. Нормативы новых
                  сотрудников из CRM подставляются по умолчанию (20 звонков и 40
                  наборов в день, 15 встреч в месяц, 80% Next Step): задайте
                  свои.
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={runImport}
                  disabled={syncCrmManagersMutation.isPending}
                  className="h-8 gap-1.5 text-xs font-semibold"
                  data-testid="btn-sync-crm-managers"
                  title="Импортировать сотрудников из подключенной CRM"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 text-primary ${
                      syncCrmManagersMutation.isPending ? 'animate-spin' : ''
                    }`}
                  />
                  <span>
                    {syncCrmManagersMutation.isPending
                      ? 'Синхронизация...'
                      : crmLabel}
                  </span>
                </Button>
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
                  onClick={handleSaveManagers}
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
              {/* Плашка распределения плана компании: без плана распределять нечего, красная тревога была бы ложной */}
              {companyPlan > 0 && (
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
                        className={`font-mono text-xs font-semibold ${
                          distributionPct >= 95 && distributionPct <= 105
                            ? 'border-emerald-500 text-emerald-700 dark:text-emerald-400'
                            : (distributionPct >= 70 && distributionPct < 95) ||
                                (distributionPct > 105 &&
                                  distributionPct <= 120)
                              ? 'border-amber-500 text-amber-700 dark:text-amber-400'
                              : 'border-rose-500 text-rose-700 dark:text-rose-400'
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
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : (distributionPct >= 70 &&
                                    distributionPct < 95) ||
                                  (distributionPct > 105 &&
                                    distributionPct <= 120)
                                ? 'text-amber-700 dark:text-amber-400'
                                : 'text-rose-700 dark:text-rose-400'
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
                    <div className="h-2 w-full overflow-hidden rounded-full bg-subtle">
                      <div
                        className={`h-full transition-all duration-300 ${
                          distributionPct >= 95 && distributionPct <= 105
                            ? 'bg-emerald-500'
                            : (distributionPct >= 70 && distributionPct < 95) ||
                                (distributionPct > 105 &&
                                  distributionPct <= 120)
                              ? 'bg-amber-500'
                              : 'bg-rose-500'
                        }`}
                        style={{ width: `${Math.min(100, distributionPct)}%` }}
                      />
                    </div>
                    <div className="text-right font-mono text-xs text-tertiary">
                      {totalPersonalPlans.toLocaleString('ru-RU')} /{' '}
                      {companyPlan.toLocaleString('ru-RU')} ₽
                    </div>
                  </div>
                </div>
              </div>
              )}

              {isAddingManager && (
                <div
                  className="border-primary/30 bg-primary/5 space-y-3 rounded-lg border p-4"
                  data-testid="add-manager-form"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <UserPlus className="h-4 w-4 text-primary" />
                      <span>
                        Новый менеджер в команду (с пресетами нормативов)
                      </span>
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
                      className="text-xs font-medium text-rose-700 dark:text-rose-500"
                      data-testid="add-manager-error"
                    >
                      {addManagerError}
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
                    <div>
                      <Label className="text-xs text-muted-foreground">
                        Код сотрудника
                      </Label>
                      <Input
                        placeholder="например: m5"
                        value={newManagerId}
                        onChange={(e) => setNewManagerId(e.target.value)}
                        aria-label="Код сотрудника"
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
                          setNewManagerDailyCalls(parseInt(e.target.value) || 0)
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
                          setNewManagerDailyDials(parseInt(e.target.value) || 0)
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
                        <label className="flex cursor-pointer items-center gap-1 text-xs text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={newManagerMeetingsEnabled}
                            onChange={(e) =>
                              setNewManagerMeetingsEnabled(e.target.checked)
                            }
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
                        value={
                          newManagerMeetingsEnabled ? newManagerMeetings : ''
                        }
                        placeholder={
                          newManagerMeetingsEnabled ? '15' : '— (Откл.)'
                        }
                        onChange={(e) =>
                          setNewManagerMeetings(parseInt(e.target.value) || 0)
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
                          setNewManagerCapacity(parseInt(e.target.value) || 0)
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
                          <div className="text-xs font-normal text-muted-foreground">
                            ≥60с / наборы
                          </div>
                        </div>
                      </th>
                      <th className="w-32 px-3 py-2.5 text-left font-medium">
                        <div className="leading-tight">
                          <span>Встречи / мес</span>
                          <div className="text-xs font-normal text-muted-foreground">
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
                    {managers.length === 0 && (
                      <tr>
                        <td
                          colSpan={7}
                          className="py-8 text-center text-xs text-muted-foreground"
                          data-testid="managers-empty-row"
                        >
                          В команде пока нет добавленных сотрудников. Нажмите{' '}
                          <button
                            type="button"
                            onClick={runImport}
                            className="font-medium text-primary underline underline-offset-2 hover:opacity-80"
                          >
                            «{crmLabel}»
                          </button>{' '}
                          для автоматического импорта из CRM или добавьте
                          вручную через «+ Добавить менеджера».
                        </td>
                      </tr>
                    )}
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
                              readOnly={isCrmId(m.id)}
                              title={isCrmId(m.id) ? 'Имя берётся из CRM и обновляется при импорте' : undefined}
                              aria-label={`Имя сотрудника ${m.id}`}
                              data-testid={`input-manager-name-${m.id}`}
                            />
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <span className="font-mono text-xs">
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
                                className="h-5 w-32 border-transparent bg-transparent px-1 text-xs text-muted-foreground hover:border-subtle focus:border-primary"
                                aria-label={`Должность сотрудника ${m.id}`}
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
                              aria-label={`План выручки сотрудника ${m.id}, рублей в месяц`}
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
                              aria-label={`Звонков в день, сотрудник ${m.id}`}
                              data-testid={`input-manager-calls-${m.id}`}
                            />
                            <span className="font-mono text-xs text-muted-foreground">
                              /
                            </span>
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
                              aria-label={`Наборов в день, сотрудник ${m.id}`}
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
                              className="h-4 w-4 cursor-pointer rounded border-subtle text-primary focus:ring-primary"
                              title={
                                m.meetings_enabled !== false
                                  ? 'Встречи учитываются в KPI и РНП'
                                  : 'Встречи отключены (не учитываются)'
                              }
                              aria-label={`Учитывать встречи, сотрудник ${m.id}`}
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
                                aria-label={`Встреч в месяц, сотрудник ${m.id}`}
                                data-testid={`input-manager-meetings-${m.id}`}
                              />
                            ) : (
                              <span className="font-mono text-xs italic text-muted-foreground">
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
                              aria-label={`Вместимость в сделках, сотрудник ${m.id}`}
                              data-testid={`input-manager-capacity-${m.id}`}
                            />
                            <span className="text-xs text-muted-foreground">
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
                              aria-label={`Next Step в процентах, сотрудник ${m.id}`}
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
                            className={`h-7 p-0 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-600 ${
                              confirmDeleteId === m.id
                                ? 'w-auto px-2 text-xs font-semibold text-rose-700 dark:text-rose-400'
                                : 'w-7'
                            }`}
                            title="Удалить сотрудника из команды"
                            aria-label={
                              confirmDeleteId === m.id
                                ? `Подтвердить удаление сотрудника ${m.id}`
                                : `Удалить сотрудника ${m.id}`
                            }
                            data-testid={`btn-delete-manager-${m.id}`}
                          >
                            {confirmDeleteId === m.id ? (
                              <span>Удалить?</span>
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </Button>
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
                        <span className="font-mono text-xs uppercase text-muted-foreground">
                          [{mod.code}]
                        </span>
                        <Badge variant="outline" className="text-xs">
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
                          className="flex items-center space-x-1 border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-500"
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

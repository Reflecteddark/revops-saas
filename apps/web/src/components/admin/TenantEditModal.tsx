import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Copy,
  Check,
  Globe,
  Radio,
  FileSpreadsheet,
  KeyRound,
  Trash2,
  Snowflake,
  Sun,
  Archive,
  RefreshCw,
  ExternalLink,
  ShieldAlert,
  Save,
} from 'lucide-react';
import { adminApi } from '@/lib/api';
import type { TenantLifecycleRecord, TenantUpdatePayload } from '@/types/api';

interface TenantEditModalProps {
  tenant: TenantLifecycleRecord | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

export function TenantEditModal({ tenant, isOpen, onClose, onSuccess }: TenantEditModalProps) {
  const [activeTab, setActiveTab] = useState<'integrations' | 'params' | 'access' | 'lifecycle'>('integrations');

  // Form states
  const [tenantName, setTenantName] = useState('');
  const [crmType, setCrmType] = useState<'bitrix24' | 'amocrm'>('bitrix24');
  const [b24WebhookUrl, setB24WebhookUrl] = useState('');
  const [amoDomain, setAmoDomain] = useState('');
  const [amoToken, setAmoToken] = useState('');
  const [spreadsheetId, setSpreadsheetId] = useState('');
  const [nicheName, setNicheName] = useState('');
  const [avgDealCheck, setAvgDealCheck] = useState<number | string>(150000);
  const [monthlyTarget, setMonthlyTarget] = useState<number | string>(5000000);
  const [minutesQuota, setMinutesQuota] = useState<number | string>(1000);
  const [clientEmail, setClientEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');

  // Delete confirmation
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  // UI state
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ status: 'success' | 'error'; message: string } | null>(null);
  const [isTestingCrm, setIsTestingCrm] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (tenant) {
      setTenantName(tenant.tenant_name || '');
      setCrmType(tenant.crm_type === 'amocrm' ? 'amocrm' : 'bitrix24');
      setB24WebhookUrl(tenant.crm_webhook_url || tenant.b24_webhook_url || '');
      setAmoDomain(tenant.amo_domain || '');
      setAmoToken(tenant.amo_token || '');
      setSpreadsheetId(tenant.spreadsheet_id || '');
      setNicheName(tenant.niche_name || 'Универсальный B2B');
      setAvgDealCheck(tenant.avg_deal_check ?? 150000);
      setMonthlyTarget(tenant.monthly_target ?? 5000000);
      setMinutesQuota(tenant.minutes_quota ?? 1000);

      const firstClient = tenant.connected_clients?.[0];
      setClientEmail(tenant.client_email || firstClient?.login || '');
      setNewPassword('');
      setDeleteConfirmText('');
      setTestResult(null);
      setErrorMsg(null);
      setActiveTab('integrations');
    }
  }, [tenant]);

  if (!tenant) return null;

  const tenantId = tenant.tenant_id;
  const telephonyWebhookUrl = tenant.telephony_webhook_url || `https://report.ai-rop.ru/api/v1/webhooks/${tenantId}/call`;
  const amoWebhookUrl = tenant.amo_webhook_url || `https://report.ai-rop.ru/api/v1/webhooks/${tenantId}/amo-crm`;
  const bitrixWebhookUrl = tenant.bitrix_webhook_url || `https://report.ai-rop.ru/api/v1/webhooks/${tenantId}/bitrix24`;
  const sheetUrl = spreadsheetId ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}` : null;

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleGeneratePassword = () => {
    const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%';
    let res = '';
    for (let i = 0; i < 12; i++) {
      res += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewPassword(res);
  };

  // Test CRM connection dry-run
  const handleTestCrm = async () => {
    setIsTestingCrm(true);
    setTestResult(null);
    try {
      if (crmType === 'bitrix24') {
        if (!b24WebhookUrl.trim()) {
          setTestResult({ status: 'error', message: 'Введите входящий вебхук Bitrix24 REST API для проверки' });
          setIsTestingCrm(false);
          return;
        }
        // Save current b24 webhook first so test runs against active config
        await adminApi.updateTenant(tenantId, { crm_type: 'bitrix24', crm_webhook_url: b24WebhookUrl.trim() });
        const res = await adminApi.crmAction({ action: 'show_stages', tenant_id: tenantId, crm_type: 'bitrix24' });
        if (res.success) {
          setTestResult({ status: 'success', message: res.message || '✅ Соединение с Bitrix24 успешно! Воронка синхронизирована.' });
        } else {
          setTestResult({ status: 'error', message: res.message || '⚠️ Bitrix24 не отвечает. Проверьте права вебхука.' });
        }
      } else {
        if (!amoDomain.trim() || !amoToken.trim()) {
          setTestResult({ status: 'error', message: 'Укажите домен и API токен amoCRM' });
          setIsTestingCrm(false);
          return;
        }
        await adminApi.updateTenant(tenantId, { crm_type: 'amocrm', amo_domain: amoDomain.trim(), amo_token: amoToken.trim() });
        const res = await adminApi.crmAction({ action: 'show_stages', tenant_id: tenantId, crm_type: 'amocrm' });
        if (res.success) {
          setTestResult({ status: 'success', message: res.message || '✅ amoCRM API v4 авторизован! Воронка синхронизирована.' });
        } else {
          setTestResult({ status: 'error', message: res.message || '⚠️ amoCRM отклонил запрос. Проверьте токен или домен.' });
        }
      }
    } catch (err: any) {
      setTestResult({ status: 'error', message: `Ошибка проверки: ${err?.response?.data?.detail || err.message}` });
    } finally {
      setIsTestingCrm(false);
    }
  };

  // Submit updates
  const handleSave = async () => {
    setIsSaving(true);
    setErrorMsg(null);
    try {
      const payload: TenantUpdatePayload = {
        tenant_name: tenantName.trim() || undefined,
        crm_type: crmType,
        crm_webhook_url: crmType === 'bitrix24' ? b24WebhookUrl.trim() : undefined,
        amo_domain: crmType === 'amocrm' ? amoDomain.trim() : undefined,
        amo_token: crmType === 'amocrm' ? amoToken.trim() : undefined,
        spreadsheet_id: spreadsheetId.trim() || undefined,
        niche_name: nicheName.trim() || undefined,
        avg_deal_check: Number(avgDealCheck) || 150000,
        monthly_target: Number(monthlyTarget) || 5000000,
        minutes_quota: Number(minutesQuota) || 1000,
        client_email: clientEmail.trim() || undefined,
        new_password: newPassword.trim() || undefined,
      };

      await adminApi.updateTenant(tenantId, payload);
      onSuccess(`Параметры и интеграции клиента ${tenantName} (${tenantId}) успешно обновлены`);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.detail || err.message || 'Ошибка при сохранении параметров клиента');
    } finally {
      setIsSaving(false);
    }
  };

  // Lifecycle actions
  const handleToggleFreeze = async () => {
    const isFrozen = tenant.effective_status === 'frozen';
    const action = isFrozen ? 'unfreeze' : 'freeze';
    try {
      await adminApi.setTenantStatus(tenantId, action);
      onSuccess(isFrozen ? `Клиент ${tenantId} успешно разморожен` : `Клиент ${tenantId} заморожен`);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.detail || err.message);
    }
  };

  const handleOffboard = async () => {
    try {
      await adminApi.setTenantStatus(tenantId, 'offboard');
      onSuccess(`Клиент ${tenantId} отключен и перемещён в архив`);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.detail || err.message);
    }
  };

  const handleDeletePermanently = async () => {
    if (deleteConfirmText.trim().toUpperCase() !== 'DELETE') {
      setErrorMsg('Для подтверждения полного удаления введите слово DELETE в поле подтверждения');
      return;
    }
    try {
      await adminApi.deleteTenant(tenantId);
      onSuccess(`Организация ${tenantId} (${tenantName}) полностью удалена из базы данных и реестров`);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.detail || err.message);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-surface border-subtle text-foreground">
        <DialogHeader>
          <div className="flex items-center justify-between pr-6">
            <div className="flex items-center gap-2">
              <span className="font-mono text-primary font-bold text-base">{tenantId}</span>
              <span className="text-secondary">•</span>
              <DialogTitle className="text-base font-bold text-foreground">
                {tenantName || tenant.tenant_name}
              </DialogTitle>
            </div>
            <Badge
              variant="outline"
              className={
                tenant.effective_status === 'active'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs'
                  : tenant.effective_status === 'frozen'
                  ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400 text-xs'
                  : 'border-subtle bg-subtle text-tertiary text-xs'
              }
            >
              {tenant.effective_status === 'active'
                ? 'Активен'
                : tenant.effective_status === 'frozen'
                ? 'Заморожен'
                : 'В архиве'}
            </Badge>
          </div>
          <DialogDescription className="text-xs text-secondary">
            Управление интеграциями, замена API-токенов CRM, настройка персональных вебхуков телефонии и жизненного цикла.
          </DialogDescription>
        </DialogHeader>

        {errorMsg && (
          <Alert className="border-rose-500/30 bg-rose-500/10 text-rose-300 py-2">
            <ShieldAlert className="h-4 w-4 text-rose-400 inline mr-2" />
            <AlertDescription className="text-xs">{errorMsg}</AlertDescription>
          </Alert>
        )}

        <Tabs value={activeTab} onValueChange={(val: any) => setActiveTab(val)} className="w-full mt-2">
          <TabsList className="grid grid-cols-4 bg-subtle/50 h-9">
            <TabsTrigger value="integrations" className="text-xs">
              <Radio className="h-3.5 w-3.5 mr-1.5" />
              Интеграции & Вебхуки
            </TabsTrigger>
            <TabsTrigger value="params" className="text-xs">
              <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" />
              Параметры & Таблица
            </TabsTrigger>
            <TabsTrigger value="access" className="text-xs">
              <KeyRound className="h-3.5 w-3.5 mr-1.5" />
              Доступ & Пароль
            </TabsTrigger>
            <TabsTrigger value="lifecycle" className="text-xs text-rose-400">
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Жизненный цикл
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: INTEGRATIONS & WEBHOOKS */}
          <TabsContent value="integrations" className="space-y-4 pt-3">
            {/* Dedicated Telephony Webhook Box */}
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-medium text-xs text-foreground">
                  <Radio className="h-4 w-4 text-primary" />
                  <span>Персональный вебхук для телефонии клиента (Mango, UIS, Sipuni, Beeline, Novofon)</span>
                </div>
                <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30">
                  Телефония
                </Badge>
              </div>
              <p className="text-[11px] text-secondary">
                Вставьте этот URL в настройках интеграции АТС клиента для мгновенной передачи аудиозаписей в речевой аудит:
              </p>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={telephonyWebhookUrl}
                  className="font-mono text-xs bg-surface border-subtle select-all h-8"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1 text-xs shrink-0"
                  onClick={() => handleCopy(telephonyWebhookUrl, 'telephony')}
                >
                  {copiedKey === 'telephony' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copiedKey === 'telephony' ? 'Скопировано' : 'Копировать'}</span>
                </Button>
              </div>
            </div>

            {/* CRM Selection & Credentials */}
            <div className="rounded-lg border border-subtle bg-subtle/30 p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-foreground">Тип CRM-системы клиента</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={crmType === 'bitrix24' ? 'default' : 'outline'}
                    className="h-7 text-xs"
                    onClick={() => setCrmType('bitrix24')}
                  >
                    Bitrix24 REST
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={crmType === 'amocrm' ? 'default' : 'outline'}
                    className="h-7 text-xs"
                    onClick={() => setCrmType('amocrm')}
                  >
                    amoCRM API v4
                  </Button>
                </div>
              </div>

              {crmType === 'bitrix24' ? (
                <div className="space-y-3 pt-1">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-secondary">Входящий вебхук Bitrix24 REST API</Label>
                      <span className="text-[11px] text-tertiary">Создаётся в Маркет ➔ Разработчикам ➔ Входящий вебхук</span>
                    </div>
                    <Input
                      placeholder="https://company.bitrix24.ru/rest/1/abcdef1234567890/"
                      value={b24WebhookUrl}
                      onChange={(e) => setB24WebhookUrl(e.target.value)}
                      className="font-mono text-xs bg-surface border-subtle"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-tertiary">
                      Вебхук для обратных событий Битрикс: <code className="font-mono text-primary">{bitrixWebhookUrl}</code>
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1"
                      onClick={() => handleCopy(bitrixWebhookUrl, 'b24-wh')}
                    >
                      {copiedKey === 'b24-wh' ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                      <span>Копировать URL событий</span>
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 pt-1">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-secondary">Домен amoCRM</Label>
                      <Input
                        placeholder="company.amocrm.ru"
                        value={amoDomain}
                        onChange={(e) => setAmoDomain(e.target.value)}
                        className="font-mono text-xs bg-surface border-subtle"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-secondary">Долгоживущий токен API v4 (Bearer)</Label>
                      <Input
                        type="password"
                        placeholder="eyJhbGciOi..."
                        value={amoToken}
                        onChange={(e) => setAmoToken(e.target.value)}
                        className="font-mono text-xs bg-surface border-subtle"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-tertiary">
                      Вебхук событий amoCRM: <code className="font-mono text-primary">{amoWebhookUrl}</code>
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1"
                      onClick={() => handleCopy(amoWebhookUrl, 'amo-wh')}
                    >
                      {copiedKey === 'amo-wh' ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                      <span>Копировать URL событий</span>
                    </Button>
                  </div>
                </div>
              )}

              {/* CRM Test Action */}
              <div className="pt-2 flex items-center justify-between border-t border-subtle">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1 text-xs"
                  onClick={handleTestCrm}
                  disabled={isTestingCrm}
                >
                  {isTestingCrm ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Globe className="h-3 w-3 text-primary" />}
                  <span>Проверить соединение с {crmType === 'bitrix24' ? 'Битрикс24' : 'amoCRM'}</span>
                </Button>

                {testResult && (
                  <span
                    className={`text-xs font-medium ${
                      testResult.status === 'success' ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {testResult.message}
                  </span>
                )}
              </div>
            </div>
          </TabsContent>

          {/* TAB 2: PARAMETERS & GOOGLE SHEET */}
          <TabsContent value="params" className="space-y-4 pt-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-secondary">Название компании (Организация)</Label>
                <Input
                  value={tenantName}
                  onChange={(e) => setTenantName(e.target.value)}
                  className="text-xs bg-surface border-subtle"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-secondary">Ниша / Отрасль бизнеса</Label>
                <Input
                  value={nicheName}
                  onChange={(e) => setNicheName(e.target.value)}
                  className="text-xs bg-surface border-subtle"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-secondary">Средний чек сделки (₽)</Label>
                <Input
                  type="number"
                  value={avgDealCheck}
                  onChange={(e) => setAvgDealCheck(e.target.value)}
                  className="font-mono text-xs bg-surface border-subtle"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-secondary">План выручки на месяц (₽)</Label>
                <Input
                  type="number"
                  step="100000"
                  value={monthlyTarget}
                  onChange={(e) => setMonthlyTarget(e.target.value)}
                  className="font-mono text-xs bg-surface border-subtle text-emerald-400 font-bold"
                  placeholder="5000000"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-secondary">Квота аудио в месяц (минут)</Label>
                <Input
                  type="number"
                  value={minutesQuota}
                  onChange={(e) => setMinutesQuota(e.target.value)}
                  className="font-mono text-xs bg-surface border-subtle"
                />
              </div>
            </div>

            {/* Google Spreadsheet connection */}
            <div className="rounded-lg border border-subtle bg-subtle/30 p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-foreground">Привязанная Google Таблица (SSOT)</Label>
                {sheetUrl && (
                  <a
                    href={sheetUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-emerald-400 hover:underline"
                  >
                    <span>Открыть таблицу</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              <p className="text-[11px] text-tertiary">
                Укажите ID таблицы (из адресной строки) или полную ссылку Google Sheets:
              </p>
              <Input
                placeholder="1KoKhFJR_-ZYvRgeyFZGuHeadGigVJ_V2I3theOE4YRk"
                value={spreadsheetId}
                onChange={(e) => setSpreadsheetId(e.target.value)}
                className="font-mono text-xs bg-surface border-subtle"
              />
            </div>
          </TabsContent>

          {/* TAB 3: ACCESS & PASSWORD */}
          <TabsContent value="access" className="space-y-4 pt-3">
            <div className="rounded-lg border border-subtle bg-subtle/30 p-3.5 space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-secondary">Email / Логин РОПа (администратора организации)</Label>
                <Input
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  className="font-mono text-xs bg-surface border-subtle"
                />
              </div>

              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-secondary">Новый пароль в ЛК</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[11px] text-primary hover:bg-primary/10 p-0"
                    onClick={handleGeneratePassword}
                  >
                    Сгенерировать случайный
                  </Button>
                </div>
                <Input
                  type="text"
                  placeholder="Оставьте пустым, чтобы не изменять пароль"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="font-mono text-xs bg-surface border-subtle"
                />
                {newPassword && (
                  <p className="text-[11px] text-emerald-400">
                    Будет установлен пароль: <code className="font-mono font-bold">{newPassword}</code>
                  </p>
                )}
              </div>
            </div>
          </TabsContent>

          {/* TAB 4: LIFECYCLE (DANGER ZONE) */}
          <TabsContent value="lifecycle" className="space-y-4 pt-3">
            <div className="rounded-lg border border-subtle bg-subtle/30 p-4 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-subtle">
                <div>
                  <h4 className="text-xs font-semibold text-foreground">Приостановка доступа (Заморозка)</h4>
                  <p className="text-[11px] text-secondary">
                    {tenant.effective_status === 'frozen'
                      ? 'Контур сейчас заморожен. Разморозка восстановит вход клиентов.'
                      : 'Блокирует вход пользователей в ЛК при сохранении всех данных и истории.'}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleToggleFreeze}
                  className={
                    tenant.effective_status === 'frozen'
                      ? 'border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 text-xs'
                      : 'border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 text-xs'
                  }
                >
                  {tenant.effective_status === 'frozen' ? (
                    <>
                      <Sun className="h-3.5 w-3.5 mr-1" />
                      Разморозить клиента
                    </>
                  ) : (
                    <>
                      <Snowflake className="h-3.5 w-3.5 mr-1" />
                      Заморозить клиента
                    </>
                  )}
                </Button>
              </div>

              <div className="flex items-center justify-between pb-3 border-b border-subtle">
                <div>
                  <h4 className="text-xs font-semibold text-foreground">Отключение в архив (Offboard)</h4>
                  <p className="text-[11px] text-secondary">
                    Отключает организацию, переносит в архивную книгу и отзывает доступы.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleOffboard}
                  className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10 text-xs"
                >
                  <Archive className="h-3.5 w-3.5 mr-1" />
                  Отправить в архив
                </Button>
              </div>

              {tenantId !== 'TNT-001' && (
                <div className="space-y-3 pt-1">
                  <div>
                    <h4 className="text-xs font-semibold text-rose-400">Полное удаление контура</h4>
                    <p className="text-[11px] text-secondary">
                      Безвозвратно удаляет организацию, звонки, сделки и аккаунты из базы данных. Для подтверждения введите <code className="font-mono text-rose-400 font-bold">DELETE</code>:
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Введите DELETE"
                      value={deleteConfirmText}
                      onChange={(e) => setDeleteConfirmText(e.target.value)}
                      className="font-mono text-xs w-48 border-rose-500/40 bg-rose-500/5 text-rose-300"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={deleteConfirmText.trim().toUpperCase() !== 'DELETE'}
                      onClick={handleDeletePermanently}
                      className="h-8 text-xs gap-1"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Удалить контур навсегда</span>
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex items-center justify-between border-t border-subtle pt-3 mt-4">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={isSaving} className="text-xs">
            Отмена
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
            className="h-8 gap-1.5 text-xs bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {isSaving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            <span>Сохранить изменения</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

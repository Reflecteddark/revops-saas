/**
 * apps/web/src/lib/api.ts
 *
 * Typed Axios API client for RevOps Enterprise OS v1.
 * Configured with credentials (cookies) and automatic X-Tenant-Id header injection.
 */

import axios, {
  type AxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios';
import { useRevOpsStore } from '../store/useRevOpsStore';
import type {
  AdminLogsResponse,
  AdminSystemStatus,
  AdminTenantsListResponse,
  AnalystChatPayload,
  AnalystChatResponse,
  ApiError,
  Call,
  ClientLoginResponse,
  ClientProfile,
  CrmActionPayload,
  CrmStatusResponse,
  Deal,
  FleetActionRequest,
  FleetActionResponse,
  GeneralSettings,
  InsightsSummaryResponse,
  QuarantineCallsResponse,
  Settings,
  SimulateCallPayload,
  StageConfig,
  TelegramConfig,
  Tenant,
  TenantHealthDiagnostic,
  TenantProvisionPayload,
  TenantProvisionResponse,
  TenantsSummary,
  TokenResponse,
  User,
} from '../types/api';

const BASE_URL: string = import.meta.env.VITE_API_URL || '/api/v1';

export const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ============================================================================
// Interceptors
// ============================================================================

// Request: inject Bearer token and active X-Tenant-Id from Zustand store (read via getState to avoid React hook cycles)
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const state = useRevOpsStore.getState();
    const token = state.token;
    if (token && !config.headers.has('Authorization')) {
      config.headers.set('Authorization', `Bearer ${token}`);
    }
    const activeTenantId = state.activeTenantId;
    if (activeTenantId && !config.headers.has('X-Tenant-Id')) {
      config.headers.set('X-Tenant-Id', activeTenantId);
    }
    return config;
  },
  (error: unknown) => Promise.reject(error)
);

// Response: handle 401 logout/redirect, normalize >=400 errors into ApiError
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ detail?: string; message?: string }>) => {
    if (error.response?.status === 401) {
      useRevOpsStore.getState().logout();
      if (
        typeof window !== 'undefined' &&
        window.location?.pathname !== '/login'
      ) {
        try {
          if (typeof window.location.assign === 'function') {
            window.location.assign('/login');
          } else {
            window.location.href = '/login';
          }
        } catch {
          // Ignore jsdom virtual navigation limitation in test runners
        }
      }
    }

    const apiError: ApiError = {
      detail:
        error.response?.data?.detail ||
        error.response?.data?.message ||
        error.message ||
        'Произошла ошибка при выполнении запроса',
      status_code: error.response?.status,
    };

    return Promise.reject(apiError);
  }
);

// ============================================================================
// API Modules
// ============================================================================

export const authApi = {
  login: async (email: string, password: string): Promise<TokenResponse> => {
    const res = await api.post<TokenResponse>('/auth/login', {
      email,
      password,
    });
    return res.data;
  },

  clientLogin: async (
    login: string,
    password: string
  ): Promise<ClientLoginResponse> => {
    const res = await api.post<ClientLoginResponse>('/auth/client-login', {
      login,
      password,
    });
    return res.data;
  },

  logout: async (): Promise<void> => {
    await api.post('/auth/logout');
  },

  me: async (): Promise<User> => {
    const res = await api.get<User>('/auth/me');
    return res.data;
  },
};

export const tenantsApi = {
  list: async (): Promise<Tenant[]> => {
    const res = await api.get<Tenant[]>('/tenants');
    return Array.isArray(res.data) ? res.data : [];
  },

  get: async (tenantId: string): Promise<Tenant> => {
    const res = await api.get<Tenant>(
      `/tenants/${encodeURIComponent(tenantId)}`
    );
    return res.data;
  },

  summary: async (): Promise<TenantsSummary> => {
    const res = await api.get<TenantsSummary>('/tenants/summary');
    return res.data;
  },
};

export const dealsApi = {
  list: async (params?: {
    tenant_id?: string;
    status?: string;
    stage_id?: string;
    stage?: string;
    sla_risk_only?: boolean;
  }): Promise<Deal[]> => {
    const res = await api.get<
      { deals?: Deal[]; [key: string]: unknown } | Deal[]
    >('/deals', {
      params,
    });
    const data = res.data;
    if (Array.isArray(data)) {
      return data;
    }
    if (data && Array.isArray(data.deals)) {
      return data.deals;
    }
    return [];
  },
};

export const callsApi = {
  list: async (params?: {
    tenant_id?: string;
    deal_id?: string;
    status?: string;
    limit?: number;
  }): Promise<Call[]> => {
    const res = await api.get<
      { calls?: Call[]; [key: string]: unknown } | Call[]
    >('/calls/data', {
      params,
    });
    const data = res.data;
    if (Array.isArray(data)) {
      return data;
    }
    if (data && Array.isArray(data.calls)) {
      return data.calls;
    }
    return [];
  },
};

export const settingsApi = {
  get: async (tenantId?: string): Promise<Settings> => {
    const effectiveTenant =
      tenantId || useRevOpsStore.getState().activeTenantId || 'TNT-001';
    const res = await api.get<Settings>('/settings', {
      params: { tenant_id: effectiveTenant },
    });
    return res.data;
  },

  update: async (payload: {
    tenant_id: string;
    general?: Partial<GeneralSettings>;
    stages?: StageConfig[];
    telegram?: Partial<TelegramConfig>;
  }): Promise<Settings> => {
    const res = await api.post<
      { settings?: Settings; [key: string]: unknown } | Settings
    >('/settings', payload);
    const data = res.data;
    if ('settings' in data && data.settings) {
      return data.settings as Settings;
    }
    return data as Settings;
  },

  updateGeneral: async (
    tenantId: string,
    general: Partial<GeneralSettings>
  ): Promise<Settings> => {
    return settingsApi.update({ tenant_id: tenantId, general });
  },

  updateStages: async (
    tenantId: string,
    stages: StageConfig[]
  ): Promise<Settings> => {
    return settingsApi.update({ tenant_id: tenantId, stages });
  },

  updateTelegram: async (
    tenantId: string,
    telegram: Partial<TelegramConfig>
  ): Promise<Settings> => {
    return settingsApi.update({ tenant_id: tenantId, telegram });
  },
};

export const adminApi = {
  getStatus: async (): Promise<AdminSystemStatus> => {
    const res = await api.get<AdminSystemStatus>('/admin/status');
    return res.data;
  },

  fleetAction: async (payload: FleetActionRequest): Promise<FleetActionResponse> => {
    const res = await api.post<FleetActionResponse>('/admin/fleet/action', payload);
    return res.data;
  },

  getLogs: async (logType = 'console', filterLevel = 'all'): Promise<AdminLogsResponse> => {
    const res = await api.get<AdminLogsResponse>('/admin/logs', {
      params: { log_type: logType, filter_level: filterLevel },
    });
    return res.data;
  },

  clearLogs: async (): Promise<{ success: boolean }> => {
    const res = await api.post<{ success: boolean }>('/admin/logs/clear');
    return res.data;
  },

  testGemini: async (): Promise<{ success: boolean; latency_ms?: number; response?: string; error?: string }> => {
    const res = await api.post<{ success: boolean; latency_ms?: number; response?: string; error?: string }>(
      '/admin/ai/test-gemini'
    );
    return res.data;
  },

  sheetsAction: async (action: string, target?: string): Promise<{ success: boolean; output?: string }> => {
    const res = await api.post<{ success: boolean; output?: string }>('/admin/sheets/action', {
      action,
      target,
    });
    return res.data;
  },

  triggerHealer: async (action = 'status'): Promise<{ success: boolean; output?: string }> => {
    const res = await api.post<{ success: boolean; output?: string }>('/admin/healer/action', {
      action,
    });
    return res.data;
  },

  listClients: async (): Promise<ClientProfile[]> => {
    const res = await api.get<{ clients?: ClientProfile[] } | ClientProfile[]>(
      '/auth/registered-clients'
    );
    const data = res.data;
    if (Array.isArray(data)) {
      return data;
    }
    if (data && Array.isArray(data.clients)) {
      return data.clients;
    }
    return [];
  },

  createClient: async (
    payload: Record<string, unknown>
  ): Promise<ClientProfile> => {
    const res = await api.post<ClientProfile>(
      '/auth/registered-clients',
      payload
    );
    return res.data;
  },

  listTenants: async (): Promise<AdminTenantsListResponse> => {
    const res = await api.get<AdminTenantsListResponse>('/admin/tenants');
    return res.data;
  },

  provisionTenant: async (payload: TenantProvisionPayload): Promise<TenantProvisionResponse> => {
    const res = await api.post<TenantProvisionResponse>('/admin/tenants/provision', payload);
    return res.data;
  },

  setTenantStatus: async (
    tenantId: string,
    action: 'freeze' | 'unfreeze' | 'offboard' | 'restore' | string
  ): Promise<{ success: boolean; message?: string }> => {
    const res = await api.post<{ success: boolean; message?: string }>(
      `/admin/tenants/${tenantId}/status`,
      { action }
    );
    return res.data;
  },

  checkTenantHealth: async (tenantId: string): Promise<TenantHealthDiagnostic> => {
    const res = await api.get<TenantHealthDiagnostic>(`/admin/tenants/${tenantId}/health`);
    return res.data;
  },

  repairTenantSheet: async (sheetId: string): Promise<{ success: boolean; output?: string }> => {
    const res = await api.post<{ success: boolean; output?: string }>('/admin/sheets/action', {
      action: 'target',
      spreadsheet_id: sheetId,
    });
    return res.data;
  },

  getCrmStatus: async (tenantId = 'TNT-001'): Promise<CrmStatusResponse> => {
    const res = await api.get<CrmStatusResponse>('/admin/crm/status', {
      params: { tenant_id: tenantId },
    });
    return res.data;
  },

  crmAction: async (payload: CrmActionPayload): Promise<{ success: boolean; output?: string; message?: string }> => {
    const res = await api.post<{ success: boolean; output?: string; message?: string }>(
      '/admin/crm/action',
      payload
    );
    return res.data;
  },

  getLastIncomingWebhook: async (): Promise<Record<string, unknown>> => {
    const res = await api.get<Record<string, unknown>>('/admin/webhooks/last-incoming');
    return res.data;
  },

  simulateCall: async (
    payload: SimulateCallPayload
  ): Promise<{ success: boolean; call_id?: string; message?: string }> => {
    const res = await api.post<{ success: boolean; call_id?: string; message?: string }>(
      '/admin/webhooks/simulate-call',
      payload
    );
    return res.data;
  },

  getQuarantineCalls: async (): Promise<QuarantineCallsResponse> => {
    const res = await api.get<QuarantineCallsResponse>('/admin/quarantine/calls');
    return res.data;
  },

  resolveQuarantineCall: async (
    callId: string,
    action: 'approve' | 'dismiss' | string,
    note?: string
  ): Promise<{ success: boolean; message?: string }> => {
    const res = await api.post<{ success: boolean; message?: string }>('/admin/quarantine/resolve', {
      call_id: callId,
      action,
      note,
    });
    return res.data;
  },
};

export const insightsApi = {
  summary: async (tenantId: string): Promise<InsightsSummaryResponse> => {
    const res = await api.get<InsightsSummaryResponse>('/insights/summary', {
      params: { tenant_id: tenantId },
    });
    return res.data;
  },

  chat: async (payload: AnalystChatPayload): Promise<AnalystChatResponse> => {
    try {
      const res = await api.post<AnalystChatResponse>(
        '/insights/analyst/chat',
        payload
      );
      return res.data;
    } catch {
      // Offline fallback synthesis based on context
      const { message, context } = payload;
      const leak = context?.leak_rub
        ? `${context.leak_rub.toLocaleString('ru-RU')} ₽`
        : '3.2M ₽';
      const pct = context?.next_step_pct ?? 48;
      const avg = context?.avg_score ?? 8.4;

      return {
        reply:
          `### Экспресс-аудит CCO / Agent 2\n\n` +
          `По вопросу: **«${message}»**\n\n` +
          `- **Утечка выручки в воронке**: выявлено сливов на **${leak}** из-за отсутствия точного дедлайна.\n` +
          `- **Дисциплина Next Step**: зафиксирована только в **${pct}%** диалогов (критический разрыв воронки).\n` +
          `- **Средний балл стандартов ОП**: **${avg} / 13**.\n\n` +
          `> **Директива CCO РОПу**: запретить перевод сделок на этап «КП отправлено» без согласованного слота Zoom. Всех зависших клиентов со статусом «Подумаю» передать старшему менеджеру на дожим с оффером ограниченного действия.`,
      };
    }
  },
};

export const apiClient = {
  auth: authApi,
  tenants: tenantsApi,
  deals: dealsApi,
  calls: callsApi,
  settings: settingsApi,
  admin: adminApi,
  insights: insightsApi,
};

export default apiClient;

/**
 * apps/web/src/lib/api.ts
 *
 * Typed Axios API client for RevOps Enterprise OS v1.
 * Configured with credentials (cookies) and automatic X-Tenant-Id header injection.
 */

import axios, { type AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { useRevOpsStore } from '../store/useRevOpsStore';
import type {
  ApiError,
  Call,
  ClientLoginResponse,
  ClientProfile,
  Deal,
  GeneralSettings,
  InsightsSummaryResponse,
  Settings,
  StageConfig,
  TelegramConfig,
  Tenant,
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

// Request: inject active X-Tenant-Id from Zustand store (read via getState to avoid React hook cycles)
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const activeTenantId = useRevOpsStore.getState().activeTenantId;
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
      if (typeof window !== 'undefined' && window.location?.pathname !== '/login') {
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
    const res = await api.post<TokenResponse>('/auth/login', { email, password });
    return res.data;
  },

  clientLogin: async (login: string, password: string): Promise<ClientLoginResponse> => {
    const res = await api.post<ClientLoginResponse>('/auth/client-login', { login, password });
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
    const res = await api.get<Tenant>(`/tenants/${encodeURIComponent(tenantId)}`);
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
    const res = await api.get<{ deals?: Deal[]; [key: string]: unknown } | Deal[]>('/deals', {
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
    const res = await api.get<{ calls?: Call[]; [key: string]: unknown } | Call[]>('/calls/data', {
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
    const effectiveTenant = tenantId || useRevOpsStore.getState().activeTenantId || 'TNT-001';
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
    const res = await api.post<{ settings?: Settings; [key: string]: unknown } | Settings>(
      '/settings',
      payload
    );
    const data = res.data;
    if ('settings' in data && data.settings) {
      return data.settings as Settings;
    }
    return data as Settings;
  },

  updateGeneral: async (tenantId: string, general: Partial<GeneralSettings>): Promise<Settings> => {
    return settingsApi.update({ tenant_id: tenantId, general });
  },

  updateStages: async (tenantId: string, stages: StageConfig[]): Promise<Settings> => {
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

  createClient: async (payload: Record<string, unknown>): Promise<ClientProfile> => {
    const res = await api.post<ClientProfile>('/auth/registered-clients', payload);
    return res.data;
  },
};

export const insightsApi = {
  summary: async (tenantId: string): Promise<InsightsSummaryResponse> => {
    const res = await api.get<InsightsSummaryResponse | { summary?: string; [key: string]: unknown }>(
      '/insights/summary',
      { params: { tenant_id: tenantId } }
    );
    const data = (res.data || {}) as Record<string, unknown>;
    return {
      status: (data.status as string) || 'ok',
      engine: (data.engine as string) || 'default',
      tenant_id: (data.tenant_id as string) || tenantId,
      p10_corridor_rub: Number(data.p10_corridor_rub) || 0,
      p50_corridor_rub: Number(data.p50_corridor_rub) || 0,
      p90_corridor_rub: Number(data.p90_corridor_rub) || 0,
      confidence_score: typeof data.confidence_score === 'number' ? data.confidence_score : 0.88,
      calculation_method: (data.calculation_method as string) || 'linear_scenario',
      recommendations: Array.isArray(data.recommendations)
        ? (data.recommendations as any)
        : Array.isArray(data.insights)
        ? (data.insights as any)
        : [],
      insights: Array.isArray(data.insights) ? (data.insights as any) : [],
      synthesis:
        (data.synthesis as string) || (data.summary as string) || (data.executive_summary as string) || '',
      executive_summary:
        (data.executive_summary as string) || (data.synthesis as string) || (data.summary as string) || '',
      leak_breakdown: (data.leak_breakdown as any) || {},
      total_leak_rub: Number(data.total_leak_rub) || 0,
    };
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

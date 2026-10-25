/**
 * apps/web/src/lib/api.test.ts
 *
 * Vitest suite for typed Axios API client and store integration.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { api, dealsApi, callsApi, tenantsApi } from './api';
import { useRevOpsStore } from '../store/useRevOpsStore';

describe('API Client & Store Integration', () => {
  beforeEach(() => {
    useRevOpsStore.setState({
      user: null,
      activeTenantId: null,
      tenants: [],
      theme: 'system',
    });
    vi.restoreAllMocks();
  });

  it('verifies withCredentials is true on the axios instance', () => {
    expect(api.defaults.withCredentials).toBe(true);
  });

  it('injects X-Tenant-Id header into requests when activeTenantId is set in store', async () => {
    useRevOpsStore.setState({ activeTenantId: 'TNT-999' });

    // Mock axios get call
    const spy = vi.spyOn(api, 'get').mockResolvedValueOnce({
      data: [{ tenant_id: 'TNT-999', tenant_name: 'Test Tenant' }],
    } as any);

    await tenantsApi.list();

    expect(spy).toHaveBeenCalled();
    // Verify interceptor logic directly
    const interceptor = (api.interceptors.request as any).handlers[0]?.fulfilled;
    expect(interceptor).toBeDefined();

    const config = interceptor({
      headers: new Map(),
    });
    expect(config.headers.get('X-Tenant-Id')).toBe('TNT-999');
  });

  it('triggers logout on 401 response and rejects with normalized ApiError', async () => {
    const assignMock = vi.fn();
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { pathname: '/dashboard', assign: assignMock, href: '/dashboard' },
    });

    useRevOpsStore.setState({
      activeTenantId: 'TNT-001',
      user: {
        id: 'usr-1',
        email: 'test@revops.ai',
        full_name: 'Test User',
        role: 'rop',
        tenant_id: 'TNT-001',
        is_active: true,
      },
    });

    const errorInterceptor = (api.interceptors.response as any).handlers[0]?.rejected;
    expect(errorInterceptor).toBeDefined();

    const mock401Error = {
      response: {
        status: 401,
        data: { detail: 'Требуется авторизация' },
      },
      message: 'Request failed with status code 401',
    };

    await expect(errorInterceptor(mock401Error)).rejects.toEqual({
      detail: 'Требуется авторизация',
      status_code: 401,
    });

    // Verify store was cleared and redirect attempted
    expect(useRevOpsStore.getState().user).toBeNull();
    expect(useRevOpsStore.getState().activeTenantId).toBeNull();
    expect(assignMock).toHaveBeenCalledWith('/login');
  });

  it('unwraps dealsApi.list defensively from both wrapped { deals: [...] } and flat array', async () => {
    const mockDeals = [
      { id: 'D-1', deal_id: 'D-1', title: 'Deal 1', amount: 100000 },
      { id: 'D-2', deal_id: 'D-2', title: 'Deal 2', amount: 200000 },
    ];

    // Case 1: Wrapped { status: "ok", deals: [...] }
    vi.spyOn(api, 'get').mockResolvedValueOnce({
      data: { status: 'ok', deals: mockDeals },
    } as any);
    const resultWrapped = await dealsApi.list({ tenant_id: 'TNT-001' });
    expect(resultWrapped).toHaveLength(2);
    expect(resultWrapped[0].id).toBe('D-1');

    // Case 2: Flat Deal[]
    vi.spyOn(api, 'get').mockResolvedValueOnce({
      data: mockDeals,
    } as any);
    const resultFlat = await dealsApi.list({ tenant_id: 'TNT-001' });
    expect(resultFlat).toHaveLength(2);
    expect(resultFlat[1].id).toBe('D-2');
  });

  it('unwraps callsApi.list defensively from both wrapped { calls: [...] } and flat array', async () => {
    const mockCalls = [
      { id: 'C-1', score: 10, status: 'won' },
      { id: 'C-2', score: 5, status: 'risk' },
    ];

    // Case 1: Wrapped { status: "ok", calls: [...] }
    vi.spyOn(api, 'get').mockResolvedValueOnce({
      data: { status: 'ok', calls: mockCalls },
    } as any);
    const resultWrapped = await callsApi.list({ tenant_id: 'TNT-001' });
    expect(resultWrapped).toHaveLength(2);
    expect(resultWrapped[0].score).toBe(10);

    // Case 2: Flat Call[]
    vi.spyOn(api, 'get').mockResolvedValueOnce({
      data: mockCalls,
    } as any);
    const resultFlat = await callsApi.list({ tenant_id: 'TNT-001' });
    expect(resultFlat).toHaveLength(2);
    expect(resultFlat[1].score).toBe(5);
  });
});

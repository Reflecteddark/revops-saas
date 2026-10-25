/**
 * apps/web/src/hooks/useWebSocket.test.ts
 *
 * Vitest suite for useWebSocket hook:
 * - Mock WebSocket lifecycle (connecting, connected, disconnected)
 * - Exponential backoff reconnect
 * - Real QueryClient cache invalidation on new_call, deal_updated, crm_switched
 * - Proper cleanup on unmount
 * - Error thrown when VITE_WS_URL is not set
 */

import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useWebSocket, getReconnectDelay, getWsUrl } from './useWebSocket';
import { useRevOpsStore } from '../store/useRevOpsStore';

// Mock WebSocket class
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSING = 2;
  static CLOSED = 3;

  url: string;
  readyState: number = MockWebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose({} as CloseEvent);
    }
  });

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.(new Event('open'));
  }

  simulateMessage(data: unknown) {
    const raw = typeof data === 'string' ? data : JSON.stringify(data);
    this.onmessage?.({ data: raw } as MessageEvent);
  }

  simulateError() {
    this.onerror?.(new Event('error'));
  }

  simulateClose() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({} as CloseEvent);
  }
}

describe('useWebSocket hook', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket);

    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    import.meta.env.VITE_WS_URL = 'ws://localhost:8000';

    useRevOpsStore.setState({
      activeTenantId: 'TNT-001',
      websocketStatus: 'disconnected',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  it('calculates exponential backoff correctly capped at 30s', () => {
    expect(getReconnectDelay(0)).toBe(1000);
    expect(getReconnectDelay(1)).toBe(2000);
    expect(getReconnectDelay(2)).toBe(4000);
    expect(getReconnectDelay(3)).toBe(8000);
    expect(getReconnectDelay(4)).toBe(16000);
    expect(getReconnectDelay(5)).toBe(30000);
    expect(getReconnectDelay(10)).toBe(30000);
  });

  it('resolves correct WebSocket URL for given tenant and throws if unset', () => {
    const url = getWsUrl('TNT-001');
    expect(url).toBe('ws://localhost:8000/ws/org/TNT-001');

    delete (import.meta.env as Record<string, unknown>).VITE_WS_URL;
    expect(() => getWsUrl('TNT-001')).toThrowError('VITE_WS_URL is not set');
    import.meta.env.VITE_WS_URL = 'ws://localhost:8000';
  });

  it('connects on mount and updates store status', () => {
    const { result } = renderHook(() => useWebSocket({ tenantId: 'TNT-001' }), { wrapper });

    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.instances[0].url).toBe('ws://localhost:8000/ws/org/TNT-001');
    expect(useRevOpsStore.getState().websocketStatus).toBe('connecting');

    act(() => {
      MockWebSocket.instances[0].simulateOpen();
    });

    expect(useRevOpsStore.getState().websocketStatus).toBe('connected');
    expect(result.current.status).toBe('connected');
  });

  it('sends heartbeat ping every 30 seconds when open', () => {
    renderHook(() => useWebSocket({ tenantId: 'TNT-001' }), { wrapper });
    const ws = MockWebSocket.instances[0];

    act(() => {
      ws.simulateOpen();
    });

    expect(ws.send).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(30000);
    });

    expect(ws.send).toHaveBeenCalledTimes(1);
    expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('"type":"ping"'));
  });

  it('invalidates calls query on new_call and call_ingested event using real QueryClient', () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    renderHook(() => useWebSocket({ tenantId: 'TNT-001' }), { wrapper });
    const ws = MockWebSocket.instances[0];

    act(() => {
      ws.simulateOpen();
      ws.simulateMessage({ event: 'new_call', data: { id: 'C-100' } });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['calls'] });

    act(() => {
      ws.simulateMessage({ event: 'call_ingested', data: { id: 'C-101' } });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['calls'] });
  });

  it('invalidates deals query on deal_updated and all queries on crm_switched', () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    renderHook(() => useWebSocket({ tenantId: 'TNT-001' }), { wrapper });
    const ws = MockWebSocket.instances[0];

    act(() => {
      ws.simulateOpen();
      ws.simulateMessage({ event: 'deal_updated', data: { deal_id: 'D-200' } });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['deals'] });

    act(() => {
      ws.simulateMessage({ event: 'crm_switched', data: {} });
    });

    expect(invalidateSpy).toHaveBeenCalledWith();
  });

  it('reconnects with exponential delay upon closure', () => {
    renderHook(() => useWebSocket({ tenantId: 'TNT-001' }), { wrapper });
    expect(MockWebSocket.instances).toHaveLength(1);

    // Simulate unexpected disconnect
    act(() => {
      MockWebSocket.instances[0].simulateClose();
    });

    expect(useRevOpsStore.getState().websocketStatus).toBe('disconnected');

    // First reconnect delay is 1000ms
    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(MockWebSocket.instances).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(MockWebSocket.instances).toHaveLength(2);

    // Second disconnect -> 2000ms delay
    act(() => {
      MockWebSocket.instances[1].simulateClose();
      vi.advanceTimersByTime(2000);
    });
    expect(MockWebSocket.instances).toHaveLength(3);
  });

  it('cleans up WebSocket and timers when unmounted', () => {
    const { unmount } = renderHook(() => useWebSocket({ tenantId: 'TNT-001' }), { wrapper });
    const ws = MockWebSocket.instances[0];

    act(() => {
      ws.simulateOpen();
    });

    unmount();

    expect(ws.close).toHaveBeenCalled();
    expect(useRevOpsStore.getState().websocketStatus).toBe('disconnected');
  });
});

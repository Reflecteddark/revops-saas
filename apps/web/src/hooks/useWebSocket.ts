/**
 * apps/web/src/hooks/useWebSocket.ts
 *
 * Realtime WebSocket connection hook for RevOps tenant events.
 * Features:
 * - Exponential backoff reconnect: 1s -> 2s -> 4s -> 8s -> 16s -> 30s (cap)
 * - 30s heartbeat ping
 * - Auto-invalidation of TanStack Query caches (calls, deals, crm_switched)
 * - Active tenant lifecycle cleanup
 * - Syncs status ('connecting' | 'connected' | 'disconnected') with Zustand store
 */

import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRevOpsStore, type WebSocketStatus } from '../store/useRevOpsStore';
import type { WebSocketMessage } from '../types/api';

export interface UseWebSocketOptions {
  tenantId?: string | null;
  enabled?: boolean;
  onMessage?: (msg: WebSocketMessage) => void;
}

export interface UseWebSocketReturn {
  status: WebSocketStatus;
  sendMessage: (data: unknown) => void;
  reconnect: () => void;
}

/**
 * Calculates exponential reconnect backoff with a 30s cap:
 * 0 -> 1s, 1 -> 2s, 2 -> 4s, 3 -> 8s, 4 -> 16s, 5+ -> 30s
 */
export function getReconnectDelay(attempt: number): number {
  return Math.min(1000 * Math.pow(2, attempt), 30000);
}

/**
 * Resolves the WebSocket endpoint URL for a given tenant.
 * Throws an Error if VITE_WS_URL is not configured (no legacy hardcoded fallback).
 */
export function getWsUrl(tenantId: string): string {
  const wsUrl = import.meta.env.VITE_WS_URL;
  if (!wsUrl) {
    throw new Error('VITE_WS_URL is not set');
  }
  const cleanBase = wsUrl.replace(/\/+$/, '');
  return `${cleanBase}/ws/org/${encodeURIComponent(tenantId)}`;
}

export function useWebSocket(
  options: UseWebSocketOptions | string | null = {}
): UseWebSocketReturn {
  const storeTenantId = useRevOpsStore((s) => s.activeTenantId);
  const status = useRevOpsStore((s) => s.websocketStatus);
  const setWebsocketStatus = useRevOpsStore((s) => s.setWebsocketStatus);

  const opts: UseWebSocketOptions =
    typeof options === 'string' || options === null ? { tenantId: options } : options || {};

  const tenantId = opts.tenantId !== undefined ? opts.tenantId : storeTenantId;
  const enabled = opts.enabled !== undefined ? opts.enabled : true;
  const onMessage = opts.onMessage;

  const queryClient = useQueryClient();

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef<number>(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isUnmountedRef = useRef<boolean>(false);

  const clearTimers = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (pingTimerRef.current) {
      clearInterval(pingTimerRef.current);
      pingTimerRef.current = null;
    }
  }, []);

  const sendMessage = useCallback((data: unknown) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const payload = typeof data === 'string' ? data : JSON.stringify(data);
      wsRef.current.send(payload);
    }
  }, []);

  const connect = useCallback(() => {
    if (isUnmountedRef.current || !enabled || !tenantId) {
      return;
    }

    clearTimers();

    // Close any previous connection
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        // ignore
      }
      wsRef.current = null;
    }

    setWebsocketStatus('connecting');

    let wsUrl: string;
    try {
      wsUrl = getWsUrl(tenantId);
    } catch (err) {
      console.error('[useWebSocket] Configuration error:', err);
      setWebsocketStatus('disconnected');
      return;
    }

    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;
    } catch (err) {
      console.error('[useWebSocket] Failed to construct WebSocket:', err);
      setWebsocketStatus('disconnected');
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      if (isUnmountedRef.current) {
        ws.close();
        return;
      }
      reconnectAttemptRef.current = 0;
      setWebsocketStatus('connected');

      // Heartbeat ping every 30s
      pingTimerRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
        }
      }, 30000);
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data) as WebSocketMessage;
        const eventType = msg.event || (msg as unknown as { type?: string }).type;

        // Reactive cache invalidations
        if (eventType === 'new_call' || eventType === 'call_ingested') {
          queryClient.invalidateQueries({ queryKey: ['calls'] });
        } else if (eventType === 'deal_updated') {
          queryClient.invalidateQueries({ queryKey: ['deals'] });
        } else if (eventType === 'crm_switched') {
          queryClient.invalidateQueries();
        } else if (eventType === 'settings_updated') {
          queryClient.invalidateQueries({ queryKey: ['settings'] });
        }

        onMessage?.(msg);
      } catch {
        // Handle pong or plain text messages
      }
    };

    ws.onerror = (err) => {
      console.warn('[useWebSocket] Socket encountered error:', err);
      // onerror will be followed by onclose
    };

    ws.onclose = () => {
      if (isUnmountedRef.current) return;
      clearTimers();
      setWebsocketStatus('disconnected');
      wsRef.current = null;
      scheduleReconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, enabled, onMessage, queryClient, clearTimers, setWebsocketStatus]);

  const scheduleReconnect = useCallback(() => {
    if (isUnmountedRef.current || !enabled || !tenantId) return;

    clearTimers();
    const delay = getReconnectDelay(reconnectAttemptRef.current);
    reconnectAttemptRef.current += 1;

    reconnectTimerRef.current = setTimeout(() => {
      if (!isUnmountedRef.current) {
        connect();
      }
    }, delay);
  }, [enabled, tenantId, clearTimers, connect]);

  useEffect(() => {
    isUnmountedRef.current = false;
    reconnectAttemptRef.current = 0;

    if (enabled && tenantId) {
      connect();
    } else {
      setWebsocketStatus('disconnected');
    }

    return () => {
      isUnmountedRef.current = true;
      clearTimers();
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          // ignore
        }
        wsRef.current = null;
      }
      setWebsocketStatus('disconnected');
    };
  }, [tenantId, enabled, connect, clearTimers, setWebsocketStatus]);

  return {
    status,
    sendMessage,
    reconnect: connect,
  };
}

export default useWebSocket;

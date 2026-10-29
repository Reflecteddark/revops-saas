/**
 * apps/web/src/components/TenantSelector.tsx
 *
 * Tenant selector dropdown using TanStack Query and Zustand store.
 * Automatically loads tenants list, displays current active tenant,
 * and handles loading / error / retry states.
 */

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { tenantsApi } from '@/lib/api';
import { useRevOpsStore } from '@/store/useRevOpsStore';
import type { Tenant } from '@/types/api';
import { cn } from '@/lib/utils';

export interface TenantSelectorProps {
  className?: string;
}

export function TenantSelector({ className }: TenantSelectorProps) {
  const { tenants, activeTenantId, setActiveTenantId, setTenants } =
    useRevOpsStore();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['tenants'],
    queryFn: tenantsApi.list,
  });

  React.useEffect(() => {
    if (data && Array.isArray(data)) {
      setTenants(data);
    }
  }, [data, setTenants]);

  if (isLoading) {
    return (
      <Skeleton
        className={cn('h-8 w-[220px] rounded-lg', className)}
        data-testid="tenant-selector-skeleton"
      />
    );
  }

  if (isError) {
    return (
      <div
        className={cn('flex items-center space-x-2', className)}
        data-testid="tenant-selector-error"
      >
        <Badge variant="destructive">Не удалось загрузить</Badge>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          className="h-7 px-2 text-xs"
          data-testid="tenant-retry-btn"
        >
          Повторить
        </Button>
      </div>
    );
  }

  const tenantList: Tenant[] = Array.isArray(data) ? data : tenants;

  if (tenantList.length <= 1) {
    const active =
      tenantList.find((t) => t.tenant_id === activeTenantId) || tenantList[0];
    if (!active) return null;
    return (
      <div
        className={cn(
          'bg-hover/50 flex items-center gap-1.5 rounded-lg border border-subtle px-3 py-1 text-xs font-semibold text-foreground',
          className
        )}
        data-testid="tenant-single-badge"
      >
        <span>{active.tenant_name}</span>
        <span className="font-mono text-[10px] text-tertiary">
          ({active.tenant_id})
        </span>
      </div>
    );
  }

  return (
    <div className={cn('flex items-center', className)}>
      <Select
        value={activeTenantId ?? ''}
        onValueChange={(val) => setActiveTenantId(val)}
      >
        <SelectTrigger
          className="h-8 w-[220px] rounded-lg border border-subtle bg-hover text-xs font-medium text-foreground transition-colors duration-150 hover:border-strong"
          data-testid="tenant-selector-trigger"
        >
          <SelectValue placeholder="Выберите тенант" />
        </SelectTrigger>
        <SelectContent>
          {tenantList.map((tenant) => (
            <SelectItem
              key={tenant.tenant_id}
              value={tenant.tenant_id}
              className="text-xs"
              data-testid={`tenant-option-${tenant.tenant_id}`}
            >
              {tenant.tenant_name} ({tenant.tenant_id})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export default TenantSelector;

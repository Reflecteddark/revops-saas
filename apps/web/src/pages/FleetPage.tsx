/**
 * apps/web/src/pages/FleetPage.tsx
 *
 * Multi-tenant fleet overview page.
 * Displays all connected tenant workspaces and allows switching the active tenant context.
 */

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Check } from 'lucide-react';
import { DataTable } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { tenantsApi } from '@/lib/api';
import { useRevOpsStore } from '@/store/useRevOpsStore';
import type { Tenant } from '@/types/api';

const fleetColumns: ColumnDef<Tenant, unknown>[] = [
  {
    accessorKey: 'tenant_id',
    header: 'ID тенанта',
    cell: ({ row }) => (
      <span className="font-mono text-xs font-bold text-foreground">
        {row.original.tenant_id}
      </span>
    ),
  },
  {
    accessorKey: 'tenant_name',
    header: 'Компания / Тенант',
    cell: ({ row }) => (
      <span className="font-medium text-foreground">
        {row.original.tenant_name}
      </span>
    ),
  },
  {
    accessorKey: 'crm_type',
    header: 'CRM система',
    cell: ({ row }) => {
      const crm = row.original.crm_type;
      const label =
        crm === 'amocrm' ? 'amoCRM' : crm === 'bitrix24' ? 'Битрикс24' : crm;
      return (
        <Badge variant="secondary" className="font-mono text-[11px]">
          {label}
        </Badge>
      );
    },
  },
  {
    accessorKey: 'status',
    header: 'Статус',
    cell: ({ row }) => {
      const status = row.original.status;
      const isActive = status === 'active';
      const label =
        status === 'active'
          ? 'Активен'
          : status === 'paused'
            ? 'Заморожен'
            : status === 'archived'
              ? 'В архиве'
              : status;
      return (
        <Badge
          variant={isActive ? 'default' : 'secondary'}
          className={isActive ? 'bg-emerald-600 text-white' : ''}
        >
          {label}
        </Badge>
      );
    },
  },
  {
    accessorKey: 'niche_name',
    header: 'Ниша / Отрасль',
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">
        {row.original.niche_name || '—'}
      </span>
    ),
  },
  {
    accessorKey: 'avg_deal_check',
    header: 'Средний чек',
    cell: ({ row }) => (
      <span className="font-mono text-xs font-medium tabular-nums text-foreground">
        {row.original.avg_deal_check
          ? `${row.original.avg_deal_check.toLocaleString('ru-RU')} ₽`
          : '—'}
      </span>
    ),
  },
];

export function FleetPage() {
  const setActiveTenantId = useRevOpsStore((s) => s.setActiveTenantId);
  const setTenants = useRevOpsStore((s) => s.setTenants);
  const [selectedMessage, setSelectedMessage] = React.useState<string | null>(
    null
  );

  const {
    data: tenants = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['tenants'],
    queryFn: tenantsApi.list,
  });

  React.useEffect(() => {
    if (Array.isArray(tenants) && tenants.length > 0) {
      setTenants(tenants);
    }
  }, [tenants, setTenants]);

  const handleTenantSelect = (tenant: Tenant) => {
    setActiveTenantId(tenant.tenant_id);
    setSelectedMessage(
      `Тенант «${tenant.tenant_name}» (${tenant.tenant_id}) выбран`
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Флот
            </h1>
            <Badge
              variant="outline"
              className="font-mono text-xs"
              data-testid="fleet-count"
            >
              {tenants.length}
            </Badge>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Реестр клиентских воронко-инстансов и подключенных рабочих
            пространств.
          </p>
        </div>
      </div>

      {/* Selected tenant notice */}
      {selectedMessage && (
        <Alert
          className="flex items-center justify-between border-emerald-500/20 bg-emerald-500/10 text-emerald-500"
          data-testid="tenant-selected-alert"
        >
          <div className="flex items-center space-x-2">
            <Check className="h-4 w-4 shrink-0" />
            <AlertDescription className="text-xs font-medium text-foreground">
              {selectedMessage}
            </AlertDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedMessage(null)}
            className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            Закрыть
          </Button>
        </Alert>
      )}

      {/* Error state */}
      {isError && (
        <Alert
          variant="destructive"
          className="flex items-center justify-between"
          data-testid="fleet-error"
        >
          <div>
            <AlertTitle>Ошибка загрузки</AlertTitle>
            <AlertDescription>
              Не удалось загрузить реестр тенантов.
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
      )}

      {/* Fleet DataTable */}
      <DataTable
        columns={fleetColumns}
        data={tenants}
        loading={isLoading}
        emptyMessage="Тенанты не найдены"
        onRowClick={handleTenantSelect}
        pageSize={20}
      />
    </div>
  );
}

export default FleetPage;

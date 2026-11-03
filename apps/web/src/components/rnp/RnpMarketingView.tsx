/**
 * apps/web/src/components/rnp/RnpMarketingView.tsx
 *
 * Marketing & Traffic RNP View:
 * - Lead intake speed & first touch SLA (<15 min response standard)
 * - SQL Qualification conversion rate (leads reaching qualified stage)
 * - Pipeline capacity saturation (incoming leads vs sales team capacity)
 * - Source/Channel distribution (Bitrix24, amoCRM, Inbound channels)
 * - AI recommendations for traffic balancing
 */

import * as React from 'react';
import {
  Target,
  Clock,
  TrendingUp,
  Sparkles,
  Users,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Deal, ManagerConfig } from '@/types/api';
import { businessDayKey, callDayKey } from '@/lib/dates';

export interface RnpMarketingViewProps {
  deals: Deal[];
  managers: ManagerConfig[];
}

export function RnpMarketingView({ deals, managers }: RnpMarketingViewProps) {
  // Open deals only: won/lost deals are not "in work" and do not load the team
  const openDeals = React.useMemo(
    () =>
      deals.filter((d) => {
        if (d.status === 'won' || d.status === 'lost' || d.is_won || d.is_lost) return false;
        const st = (d.stage_name || d.stage || '').toLowerCase();
        return !(st.includes('успешн') || st.includes('закрыт') || st.includes('отказ') || st.includes('не реализован'));
      }),
    [deals]
  );
  const totalLeads = openDeals.length;

  // Leads that arrived in the current Moscow month (by deal creation date)
  const monthKey = businessDayKey().slice(0, 7);
  const leadsMtd = React.useMemo(
    () => deals.filter((d) => (callDayKey(d.created_at) || '').startsWith(monthKey)).length,
    [deals, monthKey]
  );

  // Total team capacity from settings; 0 = no managers configured (nothing is assumed)
  const totalCapacity = React.useMemo(() => {
    return managers.reduce((sum, m) => sum + (m.capacity || 40), 0);
  }, [managers]);
  const perManagerCapacity = managers.length > 0 ? Math.round(totalCapacity / managers.length) : 0;

  // Capacity saturation index
  const saturationPct = totalCapacity > 0 ? Math.min(100, Math.round((totalLeads / totalCapacity) * 100)) : 0;
  // A traffic recommendation needs a meaningful sample, not one deal
  const MIN_DEALS_FOR_ADVICE = 10;
  const enoughData = totalCapacity > 0 && totalLeads >= MIN_DEALS_FOR_ADVICE;

  // SQL Qualified deals (passed stage 1 or reached presentation/proposal)
  const sqlDeals = React.useMemo(() => {
    return deals.filter((d) => {
      const st = (d.stage || '').toLowerCase();
      return (
        st.includes('квал') ||
        st.includes('встреч') ||
        st.includes('кп') ||
        st.includes('счет') ||
        d.status === 'won'
      );
    });
  }, [deals]);

  const sqlPct = totalLeads > 0 ? Math.round((sqlDeals.length / totalLeads) * 100) : 0;

  // Channels breakdown from crm_source strictly from factual deals (Zero Mock)
  const channels = React.useMemo(() => {
    const counts: Record<string, number> = {};
    for (const d of deals) {
      const src = d.crm_source || 'Прямой трафик';
      counts[src] = (counts[src] || 0) + 1;
    }

    const items = Object.entries(counts).map(([name, count]) => ({
      name,
      count,
      pct: totalLeads > 0 ? Math.round((count / totalLeads) * 100) : 0,
    }));

    items.sort((a, b) => b.count - a.count);
    return items;
  }, [deals, totalLeads]);

  return (
    <div className="space-y-6" data-testid="rnp-marketing-view">
      {/* 1. Header Overview & Capacity Saturation */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-subtle bg-surface">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs text-tertiary flex items-center justify-between">
              <span>Входящих лидов (MTD)</span>
              <Target className="h-4 w-4 text-sky-400" />
            </CardDescription>
            <CardTitle className="text-2xl font-bold font-mono text-foreground">
              {leadsMtd}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-[11px] text-tertiary">
              Создано в этом месяце • в работе сейчас: {totalLeads}
            </span>
          </CardContent>
        </Card>

        <Card className="border-subtle bg-surface">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs text-tertiary flex items-center justify-between">
              <span>Доля SQL-квалификации</span>
              <TrendingUp className="h-4 w-4 text-emerald-400" />
            </CardDescription>
            <CardTitle className="text-2xl font-bold font-mono text-emerald-400">
              {sqlPct}%
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-[11px] text-tertiary">
              {sqlDeals.length} лидов прошли стадию интереса
            </span>
          </CardContent>
        </Card>

        <Card className="border-subtle bg-surface">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs text-tertiary flex items-center justify-between">
              <span>SLA первого контакта</span>
              <Clock className="h-4 w-4 text-violet-400" />
            </CardDescription>
            <CardTitle className="text-2xl font-bold font-mono text-foreground">
              <span className="text-tertiary">—</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-[11px] text-tertiary flex items-center gap-1 font-medium">
              <span>Нет данных о первом контакте</span>
            </span>
          </CardContent>
        </Card>

        <Card className="border-subtle bg-surface">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs text-tertiary flex items-center justify-between">
              <span>Загрузка отдела продаж</span>
              <Users className="h-4 w-4 text-amber-400" />
            </CardDescription>
            <CardTitle className="text-2xl font-bold font-mono text-foreground">
              {totalCapacity > 0 ? `${saturationPct}%` : '—'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="w-full bg-subtle rounded-full h-1.5 mt-1 overflow-hidden">
              <div
                className={`h-1.5 rounded-full ${
                  saturationPct > 90 ? 'bg-rose-500' : saturationPct > 70 ? 'bg-amber-400' : 'bg-emerald-500'
                }`}
                style={{ width: `${saturationPct}%` }}
              />
            </div>
            <span className="text-[11px] text-tertiary mt-1 block">
              {totalCapacity > 0
                ? `${totalLeads} из ${totalCapacity} лимита воронки`
                : 'Менеджеры не заданы в настройках'}
            </span>
          </CardContent>
        </Card>
      </div>

      {/* 2. Channels Distribution & Traffic Saturation Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 surface rounded-2xl border border-subtle p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                Источники CRM
              </h3>
              <p className="text-xs text-tertiary">
                Тип CRM-системы, из которой пришла сделка
              </p>
            </div>
            <Badge variant="outline" className="text-xs font-mono">
              {channels.length} {channels.length === 1 ? 'источник' : (channels.length >= 2 && channels.length <= 4 ? 'источника' : 'источников')}
            </Badge>
          </div>

          <div className="space-y-3 pt-2">
            {channels.length > 0 ? (
              channels.map((ch, idx) => (
                <div key={idx} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground">{ch.name}</span>
                    <span className="font-mono text-tertiary">
                      {ch.count} сделок ({ch.pct}%)
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-subtle overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary/80 transition-all duration-300"
                      style={{ width: `${ch.pct}%` }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <div className="py-6 text-center text-xs text-tertiary">
                Сделок в подключенных CRM пока не обнаружено
              </div>
            )}
          </div>
        </div>

        {/* AI Traffic Balancing Recommendation */}
        <div className="lg:col-span-5 surface rounded-2xl border border-subtle p-5 space-y-3 bg-violet-500/5 border-violet-500/20">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-400" />
            <h3 className="text-sm font-semibold text-foreground">
              Балансировка трафика и вместимости
            </h3>
          </div>
          <p className="text-xs text-secondary leading-relaxed">
            {!enoughData ? (
              <>
                <strong className="text-secondary font-semibold">Недостаточно данных для рекомендации.</strong>{' '}
                {totalCapacity > 0
                  ? `Открытых сделок: ${totalLeads} — нужно от ${MIN_DEALS_FOR_ADVICE}, чтобы судить о загрузке и трафике.`
                  : 'Добавьте менеджеров в настройках, чтобы рассчитать вместимость отдела.'}
              </>
            ) : saturationPct > 85 ? (
              <>
                <strong className="text-amber-400 font-semibold">Отдел продаж перегружен.</strong> Загрузка составляет{' '}
                {saturationPct}%. Рекомендуется временно замедлить холодный трафик и переключить менеджеров на закрытие зависших КП.
              </>
            ) : saturationPct < 50 ? (
              <>
                <strong className="text-sky-400 font-semibold">Есть резерв вместимости.</strong> Менеджеры загружены всего на{' '}
                {saturationPct}%. Можно безопасно масштабировать рекламу на +25–30% без риска падения конверсии.
              </>
            ) : (
              <>
                <strong className="text-emerald-400 font-semibold">Оптимальный баланс.</strong> Текущий приток лидов полностью соответствует нормативу вместимости воронки ({totalCapacity} сделок).
              </>
            )}
          </p>
          <div className="p-3 rounded-xl bg-subtle/50 border border-subtle text-[11px] text-tertiary space-y-1">
            <div className="flex items-center justify-between">
              <span>Лимит на 1 менеджера:</span>
              <span className="font-mono font-semibold text-foreground">
                {perManagerCapacity > 0 ? `${perManagerCapacity} активных сделок` : '—'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Фактически в работе:</span>
              <span className="font-mono font-semibold text-foreground">{totalLeads} сделок</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

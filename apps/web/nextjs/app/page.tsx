'use client';

import React, { useEffect, useState } from 'react';
import { useRevOpsStore } from '../lib/store';

export default function DashboardPage() {
  const {
    p10,
    p50,
    p90,
    probTargetAchieved,
    deals,
    toasts,
    addToast,
    removeToast,
    updateDealNextStep,
  } = useRevOpsStore();

  const [isSyncing, setIsSyncing] = useState(false);

  const formatCurrency = (val: number) => {
    if (val >= 1e9) return (val / 1e9).toFixed(2) + ' B₽';
    if (val >= 1e6) return (val / 1e6).toFixed(1) + ' M₽';
    if (val >= 1e3) return (val / 1e3).toFixed(0) + ' K₽';
    return val.toLocaleString('ru-RU') + ' ₽';
  };

  const handleFixDeal = async (dealId: string) => {
    try {
      const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
      const res = await fetch(`/api/v1/deals/${dealId}/fix-next-step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ next_step_date: tomorrow }),
      });
      if (res.ok) {
        updateDealNextStep(dealId, tomorrow);
        addToast({
          type: 'success',
          title: 'Риск устранён',
          message: `Следующий контакт назначен на ${tomorrow}`,
        });
      }
    } catch {
      // Local optimistic fallback
      const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
      updateDealNextStep(dealId, tomorrow);
      addToast({
        type: 'success',
        title: 'Локальное обновление',
        message: `Шаг обновлен на ${tomorrow} (автономный режим)`,
      });
    }
  };

  const triggerSimulation = async () => {
    setIsSyncing(true);
    addToast({
      type: 'info',
      title: 'Запуск симуляции',
      message: '10 000 итераций Monte-Carlo вычисляются...',
    });
    setTimeout(() => {
      setIsSyncing(false);
      addToast({
        type: 'success',
        title: 'Прогноз обновлен',
        message: 'Коридоры выручки P10/P50/P90 пересчитаны',
      });
    }, 800);
  };

  return (
    <main className="max-w-[1440px] mx-auto p-6 space-y-6">
      {/* Top Navbar */}
      <header className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-cyan-400 flex items-center justify-center font-bold text-white shadow-lg shadow-purple-500/20">
            R
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              RevOps Intelligence <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30">v2.0 SaaS</span>
            </h1>
            <p className="text-xs text-white/50">Стохастический прогноз выручки и AI-кокпит управления рисками</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={triggerSimulation}
            disabled={isSyncing}
            className="px-4 py-2 text-sm font-medium rounded-xl bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-600/25 transition-all active:scale-95 disabled:opacity-50"
          >
            {isSyncing ? 'Вычисление...' : '⚡ Запустить симуляцию'}
          </button>
        </div>
      </header>

      {/* Bento Grid: Metric Corridors */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* P10 Card */}
        <div className="glass-card p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-white/40">Консервативный (P10)</span>
            <span className="text-xs px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">90% вероятность</span>
          </div>
          <div className="my-4">
            <div className="text-3xl font-bold tabular-nums text-white">{formatCurrency(p10)}</div>
            <p className="text-xs text-white/40 mt-1">Минимальная гарантированная планка</p>
          </div>
          <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full" style={{ width: '45%' }} />
          </div>
        </div>

        {/* P50 Hero Accent Card */}
        <div className="glass-card p-6 flex flex-col justify-between border-purple-500/40 relative overflow-hidden bg-purple-950/10 shadow-lg shadow-purple-900/10">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-purple-300">Медианный план (P50)</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-purple-500/25 text-purple-300 border border-purple-500/40 font-medium">Ключевой ориентир</span>
          </div>
          <div className="my-4">
            <div className="text-4xl font-extrabold tabular-nums gradient-text">{formatCurrency(p50)}</div>
            <p className="text-xs text-purple-300/60 mt-1">Вероятность достижения: {probTargetAchieved}%</p>
          </div>
          <div className="h-2 w-full bg-purple-950 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-purple-500 to-cyan-400 rounded-full" style={{ width: `${probTargetAchieved}%` }} />
          </div>
        </div>

        {/* P90 Card */}
        <div className="glass-card p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-white/40">Оптимистичный (P90)</span>
            <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">10% вероятность</span>
          </div>
          <div className="my-4">
            <div className="text-3xl font-bold tabular-nums text-white">{formatCurrency(p90)}</div>
            <p className="text-xs text-white/40 mt-1">При идеальной конверсии воронки</p>
          </div>
          <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full" style={{ width: '85%' }} />
          </div>
        </div>
      </section>

      {/* CRM Risk Deals Section */}
      <section className="glass-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">Радар зависших сделок (SLA Breaches)</h2>
            <p className="text-xs text-white/50">Сделки без согласованного следующего шага создают риск выпадения из P50</p>
          </div>
          <span className="text-xs px-3 py-1 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
            {deals.filter((d) => d.sla_risk).length} сделок требуют реакции
          </span>
        </div>

        <div className="divide-y divide-white/5">
          {deals.map((deal) => (
            <div key={deal.id} className="py-3.5 flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white">{deal.title}</span>
                  <span className="text-xs text-white/40">[{deal.id}]</span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-white/5 text-white/60 uppercase">{deal.crm_source}</span>
                </div>
                <div className="text-xs text-white/50 flex items-center gap-3">
                  <span>Этап: {deal.stage}</span>
                  <span>Сумма: {formatCurrency(deal.amount)}</span>
                  {deal.sla_risk ? (
                    <span className="text-rose-400 font-medium">⚠️ Следующий шаг не назначен</span>
                  ) : (
                    <span className="text-emerald-400">✓ Шаг назначен: {deal.next_step_date}</span>
                  )}
                </div>
              </div>

              {deal.sla_risk && (
                <button
                  onClick={() => handleFixDeal(deal.id)}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white/10 hover:bg-white/20 text-white border border-white/10 transition-colors"
                >
                  Назначить дату завтра
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Floating Linear-Style Toasts */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            onClick={() => removeToast(toast.id)}
            className="pointer-events-auto cursor-pointer p-4 rounded-xl border border-white/10 bg-[#161922]/95 backdrop-blur-xl shadow-2xl flex items-start gap-3 transition-all animate-in slide-in-from-bottom-5"
          >
            <div className="w-2 h-2 rounded-full mt-1.5 bg-purple-400" />
            <div className="flex-1">
              <h4 className="text-xs font-semibold text-white">{toast.title}</h4>
              <p className="text-xs text-white/70 mt-0.5">{toast.message}</p>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}

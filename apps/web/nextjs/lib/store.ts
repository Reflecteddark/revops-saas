import { create } from 'zustand';

export interface ToastItem {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
}

export interface DealItem {
  id: string;
  title: string;
  amount: number;
  stage: string;
  sla_risk: boolean;
  next_step_date: string | null;
  crm_source: string;
}

export interface SimulationState {
  leads: number;
  qualRate: number;
  closeRate: number;
  avgTicket: number;
  iterations: number;
  p10: number;
  p50: number;
  p90: number;
  probTargetAchieved: number;
  histogramBins: number[];
  histogramCounts: number[];
  isLoading: boolean;
  deals: DealItem[];
  toasts: ToastItem[];
  setParams: (params: Partial<SimulationState>) => void;
  setResults: (results: Partial<SimulationState>) => void;
  addToast: (toast: Omit<ToastItem, 'id'>) => void;
  removeToast: (id: string) => void;
  updateDealNextStep: (dealId: string, nextStepDate: string) => void;
}

export const useRevOpsStore = create<SimulationState>((set) => ({
  leads: 300,
  qualRate: 0.48,
  closeRate: 0.25,
  avgTicket: 220000,
  iterations: 10000,
  p10: 11500000,
  p50: 15800000,
  p90: 19200000,
  probTargetAchieved: 84.5,
  histogramBins: [],
  histogramCounts: [],
  isLoading: false,
  deals: [
    {
      id: 'DEAL-7842',
      title: 'ООО «ПромСнаб» — Комплект V17',
      amount: 1450000,
      stage: 'КП отправлено',
      sla_risk: true,
      next_step_date: null,
      crm_source: 'amo',
    },
    {
      id: 'DEAL-7843',
      title: 'ЗАО «ИнвестХолдинг» — Лицензии',
      amount: 890000,
      stage: 'Принятие решения',
      sla_risk: true,
      next_step_date: null,
      crm_source: 'bitrix',
    },
  ],
  toasts: [],
  setParams: (params) => set((state) => ({ ...state, ...params })),
  setResults: (results) => set((state) => ({ ...state, ...results })),
  addToast: (toast) => {
    const id = Math.random().toString(36).substring(2, 9);
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }] }));
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, 4000);
  },
  removeToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
  updateDealNextStep: (dealId, nextStepDate) =>
    set((state) => ({
      deals: state.deals.map((d) =>
        d.id === dealId
          ? { ...d, sla_risk: false, next_step_date: nextStepDate }
          : d
      ),
    })),
}));

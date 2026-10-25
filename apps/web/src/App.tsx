/**
 * apps/web/src/App.tsx
 *
 * Stage 6 demo shell rendering AppLayout with KpiCard grid.
 */

import { AppLayout } from '@/layouts/AppLayout';
import { KpiCard } from '@/components/KpiCard';

export function App() {
  return (
    <AppLayout activeHref="/pulse">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Выручка"
          value="3 500 000"
          unit="₽"
          trend={{ direction: 'up', value: 12.5, label: 'за неделю' }}
          variant="accent"
        />
        <KpiCard
          title="Звонков"
          value={1247}
          trend={{ direction: 'up', value: 8, label: 'vs план' }}
        />
        <KpiCard
          title="SLA риск"
          value={7}
          variant="danger"
          trend={{ direction: 'down', value: 3, label: 'за сутки' }}
        />
        <KpiCard
          title="Конверсия"
          value="34.2"
          unit="%"
          trend={{ direction: 'flat', value: 0 }}
        />
      </div>
    </AppLayout>
  );
}

export default App;

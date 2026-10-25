/**
 * apps/web/src/App.tsx
 *
 * Root application component rendering AppLayout with PulsePage by default.
 * Stage 8 will introduce React Router for client-side route transitions.
 */

import { AppLayout } from '@/layouts/AppLayout';
import { PulsePage } from '@/pages/PulsePage';

export function App() {
  return (
    <AppLayout activeHref="/pulse">
      <PulsePage />
    </AppLayout>
  );
}

export default App;

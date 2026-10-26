/**
 * apps/web/src/App.tsx
 *
 * Root application routing shell with authentication bootstrap,
 * route guards (ProtectedRoute, PublicRoute), and route-level code splitting via React.lazy.
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { useAuthBootstrap } from '@/lib/auth';
import { ProtectedRoute, PublicRoute } from '@/lib/guards';
import { AppLayout } from '@/layouts/AppLayout';
import { FullPageLoader } from '@/components/FullPageLoader';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorBoundary } from '@/components/ErrorBoundary';

const LoginPage = lazy(() =>
  import('@/pages/LoginPage').then((m) => ({ default: m.LoginPage }))
);
const PulsePage = lazy(() =>
  import('@/pages/PulsePage').then((m) => ({ default: m.PulsePage }))
);
const AuditPage = lazy(() =>
  import('@/pages/AuditPage').then((m) => ({ default: m.AuditPage }))
);
const SettingsPage = lazy(() =>
  import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage }))
);
const FleetPage = lazy(() =>
  import('@/pages/FleetPage').then((m) => ({ default: m.FleetPage }))
);
const IntegrationsPage = lazy(() =>
  import('@/pages/IntegrationsPage').then((m) => ({
    default: m.IntegrationsPage,
  }))
);
const AdminPage = lazy(() =>
  import('@/pages/AdminPage').then((m) => ({ default: m.AdminPage }))
);

function PageFallback() {
  return (
    <div className="space-y-4 p-6" data-testid="page-fallback">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  );
}

export function App() {
  const bootstrapped = useAuthBootstrap();
  if (!bootstrapped) return <FullPageLoader />;

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <ErrorBoundary>
        <Routes>
          <Route
            path="/login"
            element={
              <PublicRoute>
                <Suspense fallback={<PageFallback />}>
                  <LoginPage />
                </Suspense>
              </PublicRoute>
            }
          />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/pulse" replace />} />
            <Route
              path="pulse"
              element={
                <Suspense fallback={<PageFallback />}>
                  <PulsePage />
                </Suspense>
              }
            />
            <Route
              path="audit"
              element={
                <Suspense fallback={<PageFallback />}>
                  <AuditPage />
                </Suspense>
              }
            />
            <Route
              path="integrations"
              element={
                <Suspense fallback={<PageFallback />}>
                  <IntegrationsPage />
                </Suspense>
              }
            />
            <Route
              path="settings"
              element={
                <Suspense fallback={<PageFallback />}>
                  <SettingsPage />
                </Suspense>
              }
            />
            <Route
              path="fleet"
              element={
                <Suspense fallback={<PageFallback />}>
                  <FleetPage />
                </Suspense>
              }
            />
            <Route
              path="admin"
              element={
                <Suspense fallback={<PageFallback />}>
                  <AdminPage />
                </Suspense>
              }
            />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </ErrorBoundary>
    </BrowserRouter>
  );
}

export default App;

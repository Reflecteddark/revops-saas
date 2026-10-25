/**
 * apps/web/src/pages/LoginPage.tsx
 *
 * Authentication login page with email and password form,
 * loading state with spinner, and error alert handling.
 */

import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Lock, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { authApi } from '@/lib/api';
import { useRevOpsStore } from '@/store/useRevOpsStore';
import type { User } from '@/types/api';

export function LoginPage() {
  const navigate = useNavigate();
  const setUser = useRevOpsStore((s) => s.setUser);
  const setActiveTenantId = useRevOpsStore((s) => s.setActiveTenantId);

  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const isFormValid = email.trim().length > 0 && password.trim().length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid || loading) return;

    setLoading(true);
    setError(null);

    try {
      let user: User;
      try {
        const clientRes = await authApi.clientLogin(email.trim(), password);
        const tenantMatch = clientRes.user?.tenant?.match(/TNT-[A-Za-z0-9_-]+/i);
        const tenantId = tenantMatch ? tenantMatch[0].toUpperCase() : 'TNT-001';

        user = {
          id: clientRes.user?.login || email.trim(),
          email: clientRes.user?.login || email.trim(),
          full_name: clientRes.user?.name || email.trim(),
          name: clientRes.user?.name || email.trim(),
          role: clientRes.user?.role || 'admin',
          tenant_id: tenantId,
          is_active: true,
        };
      } catch {
        const res = await authApi.login(email.trim(), password);
        user = {
          id: res.user_id,
          email: email.trim(),
          full_name: res.full_name || email.trim(),
          name: res.full_name || email.trim(),
          role: res.role,
          tenant_id: res.tenant_id,
          is_active: true,
        };
      }

      setUser(user);
      if (user.tenant_id) {
        setActiveTenantId(user.tenant_id);
      }

      navigate('/pulse', { replace: true });
    } catch (err: any) {
      setError(err?.detail || err?.message || 'Неверный email или пароль');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <ShieldCheck className="h-6 w-6" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">Вход в RevOps OS</CardTitle>
          <CardDescription>
            Введите корпоративные учетные данные для доступа к аналитике
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit} data-testid="login-form">
          <CardContent className="space-y-4">
            {error && (
              <div className="flex items-center justify-center" data-testid="login-error-container">
                <Badge variant="destructive" className="w-full justify-center py-1.5 text-xs">
                  {error}
                </Badge>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Логин или Email</Label>
              <Input
                id="email"
                type="text"
                placeholder="Логин или email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                required
                disabled={loading}
                data-testid="input-email"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Пароль</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                disabled={loading}
                data-testid="input-password"
              />
            </div>
          </CardContent>

          <CardFooter className="flex flex-col space-y-3 pt-2">
            <Button
              type="submit"
              className="w-full font-medium"
              disabled={!isFormValid || loading}
              data-testid="btn-login-submit"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Вход в систему...
                </>
              ) : (
                <>
                  <Lock className="mr-2 h-4 w-4" />
                  Войти
                </>
              )}
            </Button>
            <p className="text-[11px] text-center text-muted-foreground">
              Защищенное TLS-соединение. RevOps Enterprise OS v20.7.2
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

export default LoginPage;

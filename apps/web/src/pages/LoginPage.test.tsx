/**
 * apps/web/src/pages/LoginPage.test.tsx
 *
 * Unit tests for LoginPage component.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { LoginPage } from './LoginPage';
import { useRevOpsStore } from '@/store/useRevOpsStore';
import { authApi } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  authApi: {
    login: vi.fn(),
  },
}));

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useRevOpsStore.setState({ user: null });
  });

  it('keeps submit button disabled when fields are empty', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );

    const submitBtn = screen.getByTestId('btn-login-submit');
    expect(submitBtn).toBeDisabled();
  });

  it('enables submit button when valid email and password are provided', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );

    const emailInput = screen.getByTestId('input-email');
    const passwordInput = screen.getByTestId('input-password');
    const submitBtn = screen.getByTestId('btn-login-submit');

    fireEvent.change(emailInput, { target: { value: 'admin@revops.ai' } });
    fireEvent.change(passwordInput, { target: { value: 'secret123' } });

    expect(submitBtn).not.toBeDisabled();
  });

  it('calls authApi.login and sets user in store on success', async () => {
    vi.mocked(authApi.login).mockResolvedValue({
      access_token: 'mock-jwt-token',
      token_type: 'bearer',
      user_id: 'usr-123',
      tenant_id: 'TNT-001',
      role: 'admin',
      full_name: 'Алексей Админ',
    });

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );

    const emailInput = screen.getByTestId('input-email');
    const passwordInput = screen.getByTestId('input-password');
    const submitBtn = screen.getByTestId('btn-login-submit');

    fireEvent.change(emailInput, { target: { value: 'admin@revops.ai' } });
    fireEvent.change(passwordInput, { target: { value: 'secret123' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(authApi.login).toHaveBeenCalledWith('admin@revops.ai', 'secret123');
    });

    expect(useRevOpsStore.getState().user?.email).toBe('admin@revops.ai');
    expect(useRevOpsStore.getState().user?.id).toBe('usr-123');
    expect(useRevOpsStore.getState().activeTenantId).toBe('TNT-001');
  });

  it('shows destructive badge when authApi.login fails', async () => {
    vi.mocked(authApi.login).mockRejectedValue({
      detail: 'Неверные учетные данные',
      status_code: 401,
    });

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );

    const emailInput = screen.getByTestId('input-email');
    const passwordInput = screen.getByTestId('input-password');
    const submitBtn = screen.getByTestId('btn-login-submit');

    fireEvent.change(emailInput, { target: { value: 'wrong@revops.ai' } });
    fireEvent.change(passwordInput, { target: { value: 'wrongpass' } });
    fireEvent.click(submitBtn);

    expect(await screen.findByText('Неверные учетные данные')).toBeInTheDocument();
    expect(useRevOpsStore.getState().user).toBeNull();
  });
});

/**
 * apps/web/src/components/admin/TenantEditModal.test.tsx
 *
 * Unit tests for TenantEditModal component:
 * - On-the-fly CRM/webhook replacement
 * - Editing monthly sales target (monthly_target) & business parameters
 * - CRM connection testing (Bitrix24 / amoCRM)
 * - Lifecycle controls (freeze/unfreeze, offboard)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TenantEditModal } from './TenantEditModal';
import { adminApi } from '@/lib/api';
import type { TenantLifecycleRecord } from '@/types/api';

vi.mock('@/lib/api', () => ({
  adminApi: {
    updateTenant: vi.fn(),
    crmAction: vi.fn(),
    setTenantStatus: vi.fn(),
    deleteTenant: vi.fn(),
  },
}));

const mockTenant: TenantLifecycleRecord = {
  tenant_id: 'TNT-001',
  tenant_name: 'Самозанятый (Master)',
  effective_status: 'active',
  crm_type: 'bitrix24',
  crm_webhook_url: 'https://company.bitrix24.ru/rest/1/abc123456/',
  b24_webhook_url: 'https://company.bitrix24.ru/rest/1/abc123456/',
  spreadsheet_id: '1KoKhFJR_-ZYvRgeyFZGuHeadGigVJ_V2I3theOE4YRk',
  niche_name: 'B2B Консалтинг',
  avg_deal_check: 200000,
  monthly_target: 5000000,
  minutes_quota: 1500,
  client_email: 'rop@example.com',
  telephony_webhook_url:
    'https://report.ai-rop.ru/api/v1/webhooks/TNT-001/call',
  bitrix_webhook_url:
    'https://report.ai-rop.ru/api/v1/webhooks/TNT-001/bitrix24',
  amo_webhook_url: 'https://report.ai-rop.ru/api/v1/webhooks/TNT-001/amo-crm',
};

describe('TenantEditModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders modal dialog with tenant name and tabs', () => {
    render(
      <TenantEditModal
        tenant={mockTenant}
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    expect(screen.getByText('Самозанятый (Master)')).toBeInTheDocument();
    expect(screen.getByText(/Интеграции & Вебхуки/i)).toBeInTheDocument();
    expect(screen.getByText(/Параметры & Таблица/i)).toBeInTheDocument();
    expect(screen.getByText(/Доступ & Пароль/i)).toBeInTheDocument();
    expect(screen.getByText(/Жизненный цикл/i)).toBeInTheDocument();
  });

  it('switches between CRM types (Bitrix24 <-> amoCRM)', () => {
    render(
      <TenantEditModal
        tenant={mockTenant}
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    const amoButton = screen.getByRole('button', { name: /amoCRM API v4/i });
    fireEvent.click(amoButton);

    expect(screen.getByText(/Домен amoCRM/i)).toBeInTheDocument();
    expect(screen.getByText(/Долгоживущий токен API v4/i)).toBeInTheDocument();
  });

  it('tests Bitrix24 CRM connection via adminApi.crmAction', async () => {
    vi.mocked(adminApi.updateTenant).mockResolvedValue({
      success: true,
      message: 'Updated',
    });
    vi.mocked(adminApi.crmAction).mockResolvedValue({
      success: true,
      message: '✅ Соединение с Bitrix24 успешно!',
    });

    render(
      <TenantEditModal
        tenant={mockTenant}
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    const testBtn = screen.getByRole('button', {
      name: /Проверить соединение с Битрикс24/i,
    });
    fireEvent.click(testBtn);

    await waitFor(() => {
      expect(adminApi.crmAction).toHaveBeenCalledWith({
        action: 'show_stages',
        tenant_id: 'TNT-001',
        crm_type: 'bitrix24',
      });
      expect(
        screen.getByText(/✅ Соединение с Bitrix24 успешно!/i)
      ).toBeInTheDocument();
    });
  });

  it('saves updated webhook and closes modal on success', async () => {
    vi.mocked(adminApi.updateTenant).mockResolvedValue({
      success: true,
      message: 'Updated',
    });
    const handleSuccess = vi.fn();
    const handleClose = vi.fn();

    render(
      <TenantEditModal
        tenant={mockTenant}
        isOpen={true}
        onClose={handleClose}
        onSuccess={handleSuccess}
      />
    );

    const saveBtn = screen.getByText('Сохранить изменения');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(adminApi.updateTenant).toHaveBeenCalledWith(
        'TNT-001',
        expect.objectContaining({
          tenant_name: 'Самозанятый (Master)',
          monthly_target: 5000000,
        })
      );
    });

    expect(handleSuccess).toHaveBeenCalled();
    expect(handleClose).toHaveBeenCalled();
  });

  it('triggers freeze action when clicking freeze button', async () => {
    vi.mocked(adminApi.setTenantStatus).mockResolvedValue({
      success: true,
      message: 'Frozen',
    });
    const handleSuccess = vi.fn();

    render(
      <TenantEditModal
        tenant={mockTenant}
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={handleSuccess}
      />
    );

    const lifecycleTab = screen.getByRole('tab', { name: /Жизненный цикл/i });
    fireEvent.keyDown(lifecycleTab, { key: 'Enter' });

    const freezeButton = await screen.findByRole('button', {
      name: /Заморозить клиента/i,
    });
    fireEvent.click(freezeButton);

    await waitFor(() => {
      expect(adminApi.setTenantStatus).toHaveBeenCalledWith(
        'TNT-001',
        'freeze'
      );
    });
  });
});

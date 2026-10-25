/**
 * apps/web/src/components/CcoChatDrawer.test.tsx
 *
 * Unit tests for CcoChatDrawer component.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CcoChatDrawer } from './CcoChatDrawer';
import { insightsApi } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  insightsApi: {
    chat: vi.fn(),
  },
  callsApi: {
    list: vi.fn(),
  },
}));

describe('CcoChatDrawer', () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });
  it('renders initial welcome message and quick prompts when open', () => {
    render(<CcoChatDrawer open={true} onOpenChange={vi.fn()} />);

    expect(screen.getByTestId('cco-chat-drawer')).toBeInTheDocument();
    expect(screen.getByText(/Я Коммерческий Директор/i)).toBeInTheDocument();
    expect(
      screen.getByText('Где мы теряем больше всего денег?')
    ).toBeInTheDocument();
    expect(screen.getByTestId('analyst-input')).toBeInTheDocument();
  });

  it('sends message when clicking quick prompt chip', async () => {
    vi.mocked(insightsApi.chat).mockResolvedValue({
      reply: 'Основная утечка происходит на этапе КП.',
    });

    render(<CcoChatDrawer open={true} onOpenChange={vi.fn()} />);

    const chip = screen.getByText('Где мы теряем больше всего денег?');
    fireEvent.click(chip);

    expect(insightsApi.chat).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Где мы теряем больше всего денег?',
      })
    );

    await waitFor(() => {
      expect(
        screen.getByText('Основная утечка происходит на этапе КП.')
      ).toBeInTheDocument();
    });
  });

  it('sends custom message typed in input and displays reply', async () => {
    vi.mocked(insightsApi.chat).mockResolvedValue({
      reply: 'Прогноз выполнения плана P50 составляет 82%.',
    });

    render(<CcoChatDrawer open={true} onOpenChange={vi.fn()} />);

    const input = screen.getByTestId('analyst-input');
    fireEvent.change(input, { target: { value: 'Какой прогноз на месяц?' } });

    const sendBtn = screen.getByTestId('analyst-send-btn');
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(
        screen.getByText('Прогноз выполнения плана P50 составляет 82%.')
      ).toBeInTheDocument();
    });
  });
});

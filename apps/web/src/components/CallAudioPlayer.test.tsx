import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CallAudioPlayer } from './CallAudioPlayer';
import { callsApi } from '@/lib/api';

vi.mock('@/lib/api', () => ({ callsApi: { audio: vi.fn() } }));

const blob = () => new Blob(['mp3'], { type: 'audio/mpeg' });

beforeEach(() => {
  vi.clearAllMocks();
  URL.createObjectURL = vi.fn(() => 'blob:fake');
  URL.revokeObjectURL = vi.fn();
});

describe('CallAudioPlayer', () => {
  it('a late answer for the previous call is not played in the card of the next one', async () => {
    let resolveA!: (b: Blob) => void;
    vi.mocked(callsApi.audio).mockReturnValueOnce(new Promise<Blob>((r) => (resolveA = r)));

    const { rerender } = render(<CallAudioPlayer callId="A" hasAudio testId="p" />);
    fireEvent.click(screen.getByTestId('p-play'));
    rerender(<CallAudioPlayer callId="B" hasAudio testId="p" />); // the card now shows call B

    await act(async () => resolveA(blob()));

    expect(screen.queryByTestId('p-audio')).not.toBeInTheDocument();
    expect(screen.getByTestId('p-play')).toHaveTextContent('Прослушать запись');
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('an answer that comes after the card is closed creates no file in memory', async () => {
    let resolveA!: (b: Blob) => void;
    vi.mocked(callsApi.audio).mockReturnValueOnce(new Promise<Blob>((r) => (resolveA = r)));

    const { unmount } = render(<CallAudioPlayer callId="A" hasAudio testId="p" />);
    fireEvent.click(screen.getByTestId('p-play'));
    unmount();
    await act(async () => resolveA(blob()));

    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('the file of a call is released when the card moves on', async () => {
    vi.mocked(callsApi.audio).mockResolvedValue(blob());

    const { rerender } = render(<CallAudioPlayer callId="A" hasAudio testId="p" />);
    fireEvent.click(screen.getByTestId('p-play'));
    expect(await screen.findByTestId('p-audio')).toHaveAttribute('src', 'blob:fake');

    rerender(<CallAudioPlayer callId="B" hasAudio testId="p" />);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake');
    expect(screen.queryByTestId('p-audio')).not.toBeInTheDocument();
  });
});

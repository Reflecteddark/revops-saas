/**
 * apps/web/src/components/ThemeProvider.test.tsx
 *
 * Vitest suite for ThemeProvider and useTheme hook.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ThemeProvider, useTheme } from './ThemeProvider';
import { useRevOpsStore } from '../store/useRevOpsStore';

function TestConsumer() {
  const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="resolved">{resolvedTheme}</span>
      <button onClick={() => setTheme('light')} data-testid="btn-light">
        Set Light
      </button>
      <button onClick={() => setTheme('dark')} data-testid="btn-dark">
        Set Dark
      </button>
      <button onClick={toggleTheme} data-testid="btn-toggle">
        Toggle
      </button>
    </div>
  );
}

describe('ThemeProvider & useTheme', () => {
  beforeEach(() => {
    useRevOpsStore.setState({ theme: 'dark' });
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.className = '';
  });

  it('sets data-theme attribute on document.documentElement', () => {
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>
    );

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(screen.getByTestId('theme').textContent).toBe('dark');
  });

  it('initializes with light theme when store theme is light', () => {
    useRevOpsStore.setState({ theme: 'light' });
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>
    );

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(screen.getByTestId('theme').textContent).toBe('light');
  });

  it('updates data-theme attribute when theme changes to light', () => {
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>
    );

    act(() => {
      screen.getByTestId('btn-light').click();
    });

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(useRevOpsStore.getState().theme).toBe('light');
  });

  it('toggles theme between dark and light', () => {
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>
    );

    act(() => {
      screen.getByTestId('btn-toggle').click();
    });

    expect(useRevOpsStore.getState().theme).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    act(() => {
      screen.getByTestId('btn-toggle').click();
    });

    expect(useRevOpsStore.getState().theme).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});

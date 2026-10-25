/**
 * apps/web/src/components/ThemeToggle.test.tsx
 *
 * Unit tests for ThemeToggle component.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ThemeToggle } from './ThemeToggle';
import { ThemeProvider } from './ThemeProvider';
import { useRevOpsStore } from '@/store/useRevOpsStore';

describe('ThemeToggle', () => {
  beforeEach(() => {
    useRevOpsStore.setState({ theme: 'dark' });
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.className = '';
  });

  it('renders Sun icon and light theme label when theme is dark', () => {
    render(<ThemeToggle />);
    expect(screen.getByTestId('icon-sun')).toBeInTheDocument();
    expect(screen.getByText('Светлая тема')).toBeInTheDocument();
  });

  it('renders Moon icon and dark theme label when theme is light', () => {
    useRevOpsStore.setState({ theme: 'light' });
    render(<ThemeToggle />);
    expect(screen.getByTestId('icon-moon')).toBeInTheDocument();
    expect(screen.getByText('Тёмная тема')).toBeInTheDocument();
  });

  it('toggles theme in store and updates document data-theme via ThemeProvider', () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>
    );

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(screen.getByTestId('icon-sun')).toBeInTheDocument();

    const button = screen.getByRole('button', { name: /переключить тему/i });
    fireEvent.click(button);

    expect(useRevOpsStore.getState().theme).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(screen.getByTestId('icon-moon')).toBeInTheDocument();

    fireEvent.click(button);

    expect(useRevOpsStore.getState().theme).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(screen.getByTestId('icon-sun')).toBeInTheDocument();
  });
});

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class', '[data-theme="dark"]'],
  content: [
    './index.html',
    './react.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        surface: {
          DEFAULT: 'var(--surface)',
          raised: 'var(--surface-raised)',
          from: 'var(--surface-from)',
          to: 'var(--surface-to)',
        },
        'surface-raised': 'var(--surface-raised)',
        'surface-from': 'var(--surface-from)',
        'surface-to': 'var(--surface-to)',
        'border-subtle': 'var(--border-subtle)',
        'border-strong': 'var(--border-strong)',
        subtle: 'var(--border-subtle)',
        strong: 'var(--border-strong)',
        hover: 'var(--hover)',
        active: 'var(--active)',
        text: 'var(--text)',
        'text-secondary': 'var(--text-secondary)',
        'text-tertiary': 'var(--text-tertiary)',
        secondary: 'var(--text-secondary)',
        tertiary: 'var(--text-tertiary)',
        accent: {
          DEFAULT: 'var(--accent)',
          foreground: '#ffffff',
        },
        border: 'var(--border-subtle)',
        foreground: 'var(--text)',
        muted: {
          DEFAULT: 'var(--hover)',
          foreground: 'var(--text-secondary)',
        },
        primary: {
          DEFAULT: 'var(--accent)',
          foreground: '#ffffff',
          hover: '#7c3aed',
        },
        card: {
          DEFAULT: 'var(--surface)',
          foreground: 'var(--text)',
        },
        popover: {
          DEFAULT: 'var(--surface-raised)',
          foreground: 'var(--text)',
        },
        input: 'var(--border-strong)',
        ring: 'var(--ring)',
        success: '#10b981',
        warning: '#f59e0b',
        danger: '#f43f5e',
      },
      borderRadius: {
        card: '12px',
        btn: '8px',
        pill: '9999px',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
        kpi: 'var(--font-kpi, Inter, sans-serif)',
      },
    },
  },
  plugins: [],
};

import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    base: env.VITE_BASE_PATH || process.env.VITE_BASE_PATH || '/',
    plugins: [
      react(),
      {
        name: 'copy-react-html-to-index',
        closeBundle() {
          const distReact = path.resolve(__dirname, 'dist', 'react.html');
          const distIndex = path.resolve(__dirname, 'dist', 'index.html');
          if (fs.existsSync(distReact)) {
            fs.copyFileSync(distReact, distIndex);
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://localhost:8000',
          changeOrigin: true,
          secure: false,
        },
        '/ws': {
          target: 'ws://localhost:8000',
          ws: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'react.html'),
        },
        output: {
          manualChunks: {
            'react-vendor': ['react', 'react-dom', 'react-router-dom'],
            'query-vendor': ['@tanstack/react-query'],
            'table-vendor': ['@tanstack/react-table'],
            'radix-vendor': [
              '@radix-ui/react-dialog',
              '@radix-ui/react-dropdown-menu',
              '@radix-ui/react-select',
              '@radix-ui/react-tabs',
              '@radix-ui/react-label',
              '@radix-ui/react-separator',
            ],
            icons: ['lucide-react'],
          },
        },
      },
    },
  };
});

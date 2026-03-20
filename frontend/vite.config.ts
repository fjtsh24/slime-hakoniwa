import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  server: {
    fs: { allow: ['..'] },
    proxy: {
      // /api/* → netlify dev (functions only, port 8888)
      // netlify.toml の [[redirects]] "/api/*" → "/.netlify/functions/api/:splat" が処理する
      '/api': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      reportsDirectory: '../tests/reports/frontend-coverage',
      include: ['src/**/*.{ts,tsx}'],
    },
  },
})

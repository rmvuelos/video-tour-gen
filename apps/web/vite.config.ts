import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // verify:ci and the CI must not pick up a developer's apps/web/.env.local.
  envDir: process.env['IGNORE_LOCAL_ENV'] ? import.meta.dirname + '/src' : import.meta.dirname,
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      // The 80 % gate only covers the pure logic in src/lib. Thresholds are evaluated over the
      // files matching `include`: an empty lib passes, and it applies as soon as files appear.
      include: ['src/lib/**/*.{ts,tsx}'],
      exclude: ['**/*.test.*'],
      reporter: ['text', 'lcov'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
})

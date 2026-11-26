import { defineConfig } from '@playwright/test'

const PORT = 4173

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    // Windows dev machines use the system Edge so no browser download is needed.
    channel: process.platform === 'win32' ? 'msedge' : undefined,
  },
  webServer: {
    command: `pnpm build --mode e2e && pnpm preview --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    // Fake origins: the specs that need a session mock Supabase and the API in the browser.
    env: {
      VITE_SUPABASE_URL: 'http://127.0.0.1:55421',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'e2e-key',
      VITE_API_URL: 'http://127.0.0.1:58000',
    },
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
})

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => vi.unstubAllEnvs())

describe('getSupabase', () => {
  it('throws on first use when the env is missing, not on import', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    const { getSupabase } = await import('./supabase')
    expect(() => getSupabase()).toThrow(/VITE_SUPABASE_URL/)
  })

  it('creates one client and reuses it', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'http://127.0.0.1:1')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'test-key')
    vi.stubEnv('VITE_API_URL', 'http://127.0.0.1:2')
    const { getSupabase } = await import('./supabase')
    expect(getSupabase()).toBe(getSupabase())
  })
})

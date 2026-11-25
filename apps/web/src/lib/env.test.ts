import { afterEach, describe, expect, it, vi } from 'vitest'
import { readEnv } from './env'

afterEach(() => vi.unstubAllEnvs())

function stubAll() {
  vi.stubEnv('VITE_SUPABASE_URL', 'http://127.0.0.1:1')
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'test-key')
  vi.stubEnv('VITE_API_URL', 'http://127.0.0.1:2')
}

describe('readEnv', () => {
  it('returns the validated values', () => {
    stubAll()
    expect(readEnv()).toEqual({
      supabaseUrl: 'http://127.0.0.1:1',
      supabaseKey: 'test-key',
      apiUrl: 'http://127.0.0.1:2',
    })
  })

  it('throws naming the missing variable only when called', () => {
    stubAll()
    vi.stubEnv('VITE_API_URL', '')
    expect(() => readEnv()).toThrow(/VITE_API_URL/)
  })

  it('rejects a URL that is not a URL', () => {
    stubAll()
    vi.stubEnv('VITE_SUPABASE_URL', 'nope')
    expect(() => readEnv()).toThrow(/VITE_SUPABASE_URL/)
  })
})

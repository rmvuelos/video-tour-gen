import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ getSession: vi.fn(), signOut: vi.fn() }))
vi.mock('./supabase', () => ({ getSupabase: () => ({ auth }) }))
vi.mock('./env', () => ({ readEnv: () => ({ apiUrl: 'http://api.test' }) }))

import { ApiRequestError, apiFetch } from './api'

const fetchMock = vi.fn()
const lastCall = () => fetchMock.mock.calls[0] as [string, RequestInit]
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  auth.getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } })
  auth.signOut.mockResolvedValue({ error: null })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetAllMocks()
})

describe('apiFetch', () => {
  it('sends the access token as a Bearer header and parses the JSON', async () => {
    fetchMock.mockResolvedValue(json(200, { id: 'u1' }))
    await expect(apiFetch('/me')).resolves.toEqual({ id: 'u1' })
    const [url, init] = lastCall()
    expect(url).toBe('http://api.test/me')
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer tok')
  })

  it('returns undefined for 204 No Content', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
    await expect(apiFetch('/x', { method: 'DELETE' })).resolves.toBeUndefined()
  })

  it('omits the header when there is no session', async () => {
    auth.getSession.mockResolvedValue({ data: { session: null } })
    fetchMock.mockResolvedValue(json(200, {}))
    await apiFetch('/me')
    expect(new Headers(lastCall()[1].headers).has('Authorization')).toBe(false)
  })

  it('throws a typed error from the common error envelope', async () => {
    const details = [{ code: 'too_big', message: 'Too big', index: 0 }]
    fetchMock.mockResolvedValue(
      json(422, { error: { code: 'invalid_input', message: 'Bad input', details } }),
    )
    const error = await apiFetch('/x').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiRequestError)
    expect(error).toMatchObject({
      status: 422,
      code: 'invalid_input',
      message: 'Bad input',
      details,
    })
  })

  it('signs out on 401 and still throws', async () => {
    fetchMock.mockResolvedValue(json(401, { error: { code: 'unauthorized', message: 'No' } }))
    await expect(apiFetch('/me')).rejects.toMatchObject({ status: 401, code: 'unauthorized' })
    expect(auth.signOut).toHaveBeenCalledOnce()
  })

  it('keeps the session on 503 (auth unavailable is not a bad token)', async () => {
    fetchMock.mockResolvedValue(
      json(503, { error: { code: 'auth_unavailable', message: 'Later' } }),
    )
    await expect(apiFetch('/me')).rejects.toMatchObject({ status: 503 })
    expect(auth.signOut).not.toHaveBeenCalled()
  })

  it('maps a body that is not the envelope to a generic error', async () => {
    fetchMock.mockResolvedValue(new Response('<html>', { status: 502 }))
    await expect(apiFetch('/x')).rejects.toMatchObject({ status: 502, code: 'unknown_error' })
  })

  it('maps a network failure to a network_error', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'))
    await expect(apiFetch('/x')).rejects.toMatchObject({ status: 0, code: 'network_error' })
  })

  it('sends a JSON body with its content type', async () => {
    fetchMock.mockResolvedValue(json(200, {}))
    await apiFetch('/projects', { method: 'POST', body: { name: 'Flat' } })
    const init = lastCall()[1]
    expect(init.body).toBe('{"name":"Flat"}')
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json')
  })
})

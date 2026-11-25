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
    expect(auth.signOut).toHaveBeenCalledExactlyOnceWith({ scope: 'local' })
  })

  it('closes the session once when several requests get a 401 together', async () => {
    fetchMock.mockImplementation(async () =>
      json(401, { error: { code: 'unauthorized', message: 'No' } }),
    )
    auth.signOut.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 10)))
    await Promise.allSettled([apiFetch('/a'), apiFetch('/b'), apiFetch('/c')])
    expect(auth.signOut).toHaveBeenCalledOnce()
  })

  it('ignores a late 401 for a token that is no longer the current one', async () => {
    auth.getSession
      .mockResolvedValueOnce({ data: { session: { access_token: 'old' } } })
      .mockResolvedValue({ data: { session: { access_token: 'new' } } })
    fetchMock.mockResolvedValue(json(401, { error: { code: 'unauthorized', message: 'No' } }))
    await expect(apiFetch('/me')).rejects.toMatchObject({ status: 401 })
    expect(auth.signOut).not.toHaveBeenCalled()
  })

  it('still throws the 401 error when closing the session fails', async () => {
    auth.signOut.mockRejectedValue(new Error('storage broke'))
    fetchMock.mockResolvedValue(json(401, { error: { code: 'unauthorized', message: 'No' } }))
    await expect(apiFetch('/me')).rejects.toMatchObject({ status: 401, code: 'unauthorized' })
  })

  it.each(['me', '//evil.test/x', '/\\evil.test', 'https://evil.test/x'])(
    'refuses the path %s before sending anything',
    async (path) => {
      await expect(apiFetch(path)).rejects.toThrow(TypeError)
      expect(fetchMock).not.toHaveBeenCalled()
      expect(auth.getSession).not.toHaveBeenCalled()
    },
  )

  it('propagates an abort as it is, not as a network error', async () => {
    fetchMock.mockRejectedValue(new DOMException('Aborted', 'AbortError'))
    await expect(apiFetch('/x', { signal: new AbortController().signal })).rejects.toMatchObject({
      name: 'AbortError',
    })
  })

  it('does not even read the session when the signal is already aborted', async () => {
    await expect(apiFetch('/x', { signal: AbortSignal.abort() })).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(auth.getSession).not.toHaveBeenCalled()
  })

  it('turns invalid JSON in a 2xx answer into a typed error', async () => {
    fetchMock.mockResolvedValue(new Response('<html>', { status: 200 }))
    await expect(apiFetch('/x')).rejects.toMatchObject({ status: 200, code: 'invalid_response' })
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

import { z } from 'zod'
import { readEnv } from './env'
import { safeReturnPath } from './return-path'
import { getSupabase } from './supabase'

const detailSchema = z.object({ code: z.string(), message: z.string() }).loose()
const envelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(detailSchema).nullish(),
  }),
})

export type ApiErrorDetail = z.infer<typeof detailSchema>

/** Any non-2xx answer, in the backend's common `{"error": {code, message, details}}` shape. */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: ApiErrorDetail[] | null = null,
  ) {
    super(message)
    this.name = 'ApiRequestError'
  }
}

type Options = Omit<RequestInit, 'body'> & { body?: unknown }

// One sign-out in flight, however many requests get a 401 together.
let closing: Promise<unknown> | undefined

/**
 * A 401 means the token we sent is bad: close the session so the session context sends the user
 * to /login. Skipped when the user already signed in again (a late 401 for an old token). Local
 * scope: only this browser's session ends, no server call that could fail or log out other devices.
 */
async function closeSession(sentToken: string) {
  try {
    const { auth } = getSupabase()
    const { data } = await auth.getSession()
    if (data.session?.access_token !== sentToken) return
    closing ??= auth.signOut({ scope: 'local' }).finally(() => (closing = undefined))
    await closing
  } catch {
    // The caller still gets the original 401; a failed local sign-out must not replace it.
  }
}

function endpoint(path: string) {
  const base = readEnv().apiUrl
  const url = new URL(`${base}${path}`)
  if (safeReturnPath(path) !== path || url.origin !== new URL(base).origin) {
    throw new TypeError('apiFetch needs a path on the API origin, like "/me".')
  }
  return url
}

/** Calls the API with the user's access token. 503 (auth unavailable) keeps the session. */
export async function apiFetch<T = unknown>(path: string, { body, ...init }: Options = {}) {
  const url = endpoint(path)
  init.signal?.throwIfAborted()
  const { auth } = getSupabase()
  const { data } = await auth.getSession()
  const token = data.session?.access_token
  const headers = new Headers(init.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (body !== undefined) headers.set('Content-Type', 'application/json')

  let response: Response
  try {
    const payload = body === undefined ? null : JSON.stringify(body)
    response = await fetch(url.href, { ...init, headers, body: payload })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiRequestError(0, 'network_error', 'Could not reach the server.')
  }
  if (response.ok) {
    if (response.status === 204) return undefined as T
    try {
      return (await response.json()) as T
    } catch {
      throw new ApiRequestError(response.status, 'invalid_response', 'Something went wrong.')
    }
  }

  if (response.status === 401 && token) await closeSession(token)
  const parsed = envelopeSchema.safeParse(await response.json().catch(() => null))
  if (!parsed.success) {
    throw new ApiRequestError(response.status, 'unknown_error', 'Something went wrong.')
  }
  const { code, message, details } = parsed.data.error
  throw new ApiRequestError(response.status, code, message, details ?? null)
}

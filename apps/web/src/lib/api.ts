import { z } from 'zod'
import { readEnv } from './env'
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

/**
 * Calls the API with the user's access token. A 401 means the token is bad, so the session is
 * closed: the session context then sends the user to /login. 503 (auth unavailable) keeps it.
 */
export async function apiFetch<T = unknown>(path: string, { body, ...init }: Options = {}) {
  const { auth } = getSupabase()
  const { data } = await auth.getSession()
  const headers = new Headers(init.headers)
  if (data.session) headers.set('Authorization', `Bearer ${data.session.access_token}`)
  if (body !== undefined) headers.set('Content-Type', 'application/json')

  let response: Response
  try {
    const payload = body === undefined ? null : JSON.stringify(body)
    response = await fetch(`${readEnv().apiUrl}${path}`, { ...init, headers, body: payload })
  } catch {
    throw new ApiRequestError(0, 'network_error', 'Could not reach the server.')
  }
  if (response.ok) return (response.status === 204 ? undefined : await response.json()) as T

  if (response.status === 401) await auth.signOut()
  const parsed = envelopeSchema.safeParse(await response.json().catch(() => null))
  if (!parsed.success) {
    throw new ApiRequestError(response.status, 'unknown_error', 'Something went wrong.')
  }
  const { code, message, details } = parsed.data.error
  throw new ApiRequestError(response.status, code, message, details ?? null)
}

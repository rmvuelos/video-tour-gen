import { z } from 'zod'

const schema = z.object({
  VITE_SUPABASE_URL: z.url(),
  VITE_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  VITE_API_URL: z.url(),
})

/** Lazy on purpose: a build or a test without env must work; only using Supabase or the API needs it. */
export function readEnv() {
  const parsed = schema.safeParse(import.meta.env)
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))]
    throw new Error(`Missing or invalid environment: ${names.join(', ')}`)
  }
  const env = parsed.data
  return {
    supabaseUrl: env.VITE_SUPABASE_URL,
    supabaseKey: env.VITE_SUPABASE_PUBLISHABLE_KEY,
    apiUrl: env.VITE_API_URL,
  }
}

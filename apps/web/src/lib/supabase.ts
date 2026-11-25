import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readEnv } from './env'

let client: SupabaseClient | undefined

/** Created on first use so a build or a test without env does not need Supabase. */
export function getSupabase(): SupabaseClient {
  if (!client) {
    const { supabaseUrl, supabaseKey } = readEnv()
    client = createClient(supabaseUrl, supabaseKey)
  }
  return client
}

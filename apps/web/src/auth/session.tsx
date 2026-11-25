import type { Session } from '@supabase/supabase-js'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { getSupabase } from '../lib/supabase'

/** `session` is undefined until Supabase reports the stored one (or none): that is "loading". */
type State = { session: Session | null | undefined }

const SessionContext = createContext<State | null>(null)

/** The session lives here only: components read it, Supabase owns storage and refresh. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ session: undefined })
  // No Supabase env: nobody can be signed in. The pages explain it when they try to.
  const [configured] = useState(() => {
    try {
      getSupabase()
      return true
    } catch {
      return false
    }
  })

  useEffect(() => {
    if (!configured) return undefined
    const { data } = getSupabase().auth.onAuthStateChange((_event, session) => {
      setState({ session })
    })
    return () => data.subscription.unsubscribe()
  }, [configured])

  return <SessionContext value={configured ? state : { session: null }}>{children}</SessionContext>
}

export function useSession() {
  const state = useContext(SessionContext)
  if (!state) throw new Error('useSession needs a SessionProvider')
  return state.session
}

import { render, screen, act } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Listener = (event: string, session: { user: { email: string } } | null) => void
const mock = vi.hoisted(() => ({
  listener: null as Listener | null,
  unsubscribe: vi.fn(),
  getSupabase: vi.fn(),
}))
vi.mock('../lib/supabase', () => ({ getSupabase: mock.getSupabase }))

import { RequireAuth } from './RequireAuth'
import { SessionProvider, useSession } from './session'

const SESSION = { user: { email: 'a@b.test' } }

beforeEach(() => {
  mock.getSupabase.mockReturnValue({
    auth: {
      onAuthStateChange: (cb: Listener) => {
        mock.listener = cb
        return { data: { subscription: { unsubscribe: mock.unsubscribe } } }
      },
    },
  })
})
afterEach(() => vi.resetAllMocks())

function Where() {
  const { pathname, state } = useLocation()
  return (
    <p>
      at {pathname} from {(state as { from?: { pathname: string } } | null)?.from?.pathname ?? '-'}
    </p>
  )
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SessionProvider>
        <Routes>
          <Route path="/login" element={<Where />} />
          <Route element={<RequireAuth />}>
            <Route path="/secret" element={<p>secret</p>} />
          </Route>
        </Routes>
      </SessionProvider>
    </MemoryRouter>,
  )
}

describe('SessionProvider and RequireAuth', () => {
  it('shows a loading status until Supabase reports the initial session', () => {
    renderAt('/secret')
    expect(screen.getByRole('status')).toHaveTextContent('Loading')
    expect(screen.queryByText('secret')).not.toBeInTheDocument()
  })

  it('redirects to /login remembering the requested route', async () => {
    renderAt('/secret')
    await act(async () => mock.listener?.('INITIAL_SESSION', null))
    expect(screen.getByText('at /login from /secret')).toBeInTheDocument()
  })

  it('renders the protected route with a session', async () => {
    renderAt('/secret')
    await act(async () => mock.listener?.('INITIAL_SESSION', SESSION))
    expect(screen.getByText('secret')).toBeInTheDocument()
  })

  it('sends the user to /login when the session ends', async () => {
    renderAt('/secret')
    await act(async () => mock.listener?.('INITIAL_SESSION', SESSION))
    await act(async () => mock.listener?.('SIGNED_OUT', null))
    expect(screen.getByText('at /login from /secret')).toBeInTheDocument()
  })

  it('treats a missing Supabase config as signed out instead of crashing', () => {
    mock.getSupabase.mockImplementation(() => {
      throw new Error('Missing or invalid environment: VITE_SUPABASE_URL')
    })
    renderAt('/secret')
    expect(screen.getByText('at /login from /secret')).toBeInTheDocument()
  })

  it('unsubscribes on unmount', () => {
    renderAt('/secret').unmount()
    expect(mock.unsubscribe).toHaveBeenCalledOnce()
  })

  it('useSession outside the provider fails loudly', () => {
    function Probe() {
      useSession()
      return null
    }
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(() => render(<Probe />)).toThrow(/SessionProvider/)
  })
})

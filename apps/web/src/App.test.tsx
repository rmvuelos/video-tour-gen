import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

const signedIn = vi.hoisted(() => ({ value: true }))
import { SessionProvider } from './auth/session'
import { App } from './App'

// Signed in as soon as someone subscribes, like Supabase's INITIAL_SESSION.
vi.mock('./lib/supabase', () => ({
  getSupabase: () => ({
    auth: {
      onAuthStateChange: (cb: (event: string, session: object | null) => void) => {
        cb('INITIAL_SESSION', signedIn.value ? { user: {} } : null)
        return { data: { subscription: { unsubscribe: () => undefined } } }
      },
    },
  }),
}))

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SessionProvider>
        <App />
      </SessionProvider>
    </MemoryRouter>,
  )
}

describe('App', () => {
  it('renders the rooma name as the main heading for a signed-in user', () => {
    renderAt('/')
    expect(screen.getByRole('heading', { name: 'rooma' })).toBeInTheDocument()
  })
})

describe('App signed out', () => {
  it('sends a protected route to the login page', () => {
    signedIn.value = false
    renderAt('/')
    signedIn.value = true
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })
})

describe('App /dev/ui', () => {
  it('shows the primitives gallery on the dev route', async () => {
    renderAt('/dev/ui')
    expect(await screen.findByRole('heading', { name: 'UI primitives' })).toBeInTheDocument()
  })

  it('exposes each gallery section as a named region', async () => {
    renderAt('/dev/ui')
    expect(await screen.findByRole('region', { name: 'Button' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Semantic colors' })).toBeInTheDocument()
  })
})

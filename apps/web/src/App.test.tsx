import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

const signedIn = vi.hoisted(() => ({ value: true }))
vi.mock('./lib/api', async (importActual) => ({
  ...(await importActual<typeof import('./lib/api')>()),
  apiFetch: () => new Promise(() => undefined),
}))
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
  it('lands on My projects inside the shell for a signed-in user', () => {
    renderAt('/')
    expect(screen.getByRole('heading', { name: 'My projects' })).toBeInTheDocument()
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

describe('App unknown route', () => {
  it('shows the not found page, also to signed-out visitors', () => {
    renderAt('/nope')
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })

  it('titles the projects page', () => {
    renderAt('/')
    expect(document.title).toBe('My projects · rooma')
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

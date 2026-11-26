import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Listener = (event: string, session: object | null) => void
const auth = vi.hoisted(() => ({
  listener: null as Listener | null,
  silent: false,
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
}))
vi.mock('../lib/api', async (importActual) => ({
  ...(await importActual<typeof import('../lib/api')>()),
  apiFetch: () => new Promise(() => undefined),
}))
vi.mock('../lib/supabase', () => ({
  getSupabase: () => ({
    auth: {
      signInWithPassword: auth.signInWithPassword,
      signUp: auth.signUp,
      signOut: auth.signOut,
      onAuthStateChange: (cb: Listener) => {
        auth.listener = cb
        if (!auth.silent) cb('INITIAL_SESSION', null)
        return { data: { subscription: { unsubscribe: () => undefined } } }
      },
    },
  }),
}))

import { SessionProvider } from '../auth/session'
import { App } from '../App'
import { AuthPage } from './AuthPage'

const emit = (event: string, session: object | null) =>
  act(async () => auth.listener?.(event, session))

const OK = { data: { session: { user: {} } }, error: null }
const BAD = { data: { session: null }, error: { code: 'invalid_credentials', message: 'x' } }

function renderAt(path: string, state?: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: path, state }]}>
      <SessionProvider>
        <App />
      </SessionProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  auth.silent = false
  auth.signOut.mockResolvedValue({ error: null })
})

async function fill(email: string, password: string) {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText(/Email/), email)
  await user.type(screen.getByLabelText(/Password/), password)
  return user
}

describe('/login', () => {
  it('signs in and returns to the route the user asked for', async () => {
    auth.signInWithPassword.mockResolvedValue(OK)
    renderAt('/login', { from: '/' })
    const user = await fill('a@b.test', 'secret1')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'a@b.test',
      password: 'secret1',
    })
    await emit('SIGNED_IN', { user: {} })
    expect(await screen.findByRole('heading', { name: 'My projects' })).toBeInTheDocument()
  })

  it('shows one generic message that never says whether the email exists, and focuses it', async () => {
    auth.signInWithPassword.mockResolvedValue(BAD)
    renderAt('/login')
    const user = await fill('a@b.test', 'secret1')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Incorrect email or password.')
    expect(alert).toHaveFocus()
  })

  it('disables the button and says so while the request is pending', async () => {
    auth.signInWithPassword.mockReturnValue(new Promise(() => undefined))
    renderAt('/login')
    const user = await fill('a@b.test', 'secret1')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    const button = await screen.findByRole('button', { name: 'Signing in…' })
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).toHaveFocus()
  })

  it('reports empty fields next to the field, focuses the first one and does not call Supabase', async () => {
    renderAt('/login')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Sign in' }))
    expect(screen.getByLabelText(/Email/)).toHaveAccessibleDescription('Enter your email address.')
    expect(screen.getByLabelText(/Email/)).toHaveFocus()
    expect(auth.signInWithPassword).not.toHaveBeenCalled()
  })

  it('tells a network failure apart from wrong credentials', async () => {
    auth.signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: { code: 'unexpected_failure', message: 'x' },
    })
    renderAt('/login')
    const user = await fill('a@b.test', 'secret1')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong')
  })

  it('links to the signup page', () => {
    renderAt('/login')
    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute(
      'href',
      '/signup',
    )
  })
})

describe('/signup', () => {
  it('creates the account and enters the app', async () => {
    auth.signUp.mockResolvedValue(OK)
    renderAt('/signup')
    const user = await fill('new@b.test', 'secret1')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    await emit('SIGNED_IN', { user: {} })
    expect(await screen.findByRole('heading', { name: 'My projects' })).toBeInTheDocument()
  })

  it('rejects a short password before calling Supabase', async () => {
    renderAt('/signup')
    const user = await fill('new@b.test', '123')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(screen.getByLabelText(/Password/)).toHaveAccessibleDescription(/at least 6/i)
    expect(auth.signUp).not.toHaveBeenCalled()
  })

  it('answers the same way for an existing email as for any other failure', async () => {
    auth.signUp.mockResolvedValue({
      data: { session: null },
      error: { code: 'user_already_exists', message: 'x' },
    })
    renderAt('/signup')
    const user = await fill('old@b.test', 'secret1')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('We could not create your account')
    expect(alert).not.toHaveTextContent(/exist|registered|taken/i)
  })

  it('asks to confirm the email when Supabase returns no session', async () => {
    auth.signUp.mockResolvedValue({ data: { session: null }, error: null })
    renderAt('/signup')
    const user = await fill('new@b.test', 'secret1')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Check your email')
  })
})

function renderWithProjects(from: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/login', state: { from } }]}>
      <SessionProvider>
        <Routes>
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/projects" element={<h1>Projects page</h1>} />
          <Route path="/" element={<h1>Home page</h1>} />
        </Routes>
      </SessionProvider>
    </MemoryRouter>,
  )
}

async function signInAt(from: unknown) {
  auth.signInWithPassword.mockResolvedValue(OK)
  renderWithProjects(from)
  const user = await fill('a@b.test', 'secret1')
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
  await emit('SIGNED_IN', { user: {} })
}

describe('return after signing in', () => {
  it('goes back to the requested route with its query and hash', async () => {
    await signInAt('/projects?tab=2#top')
    expect(await screen.findByRole('heading', { name: 'Projects page' })).toBeInTheDocument()
  })

  it.each(['//evil.test', 'https://evil.test'])('ignores the external target %s', async (from) => {
    await signInAt(from)
    expect(await screen.findByRole('heading', { name: 'Home page' })).toBeInTheDocument()
  })
})

describe('page state', () => {
  it('shows only the loading status, not the form, until the session is known', () => {
    auth.silent = true // Supabase has not answered yet: it subscribes without emitting.
    render(
      <MemoryRouter initialEntries={['/login']}>
        <SessionProvider>
          <AuthPage mode="login" />
        </SessionProvider>
      </MemoryRouter>,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Loading')
    expect(screen.queryByLabelText(/Email/)).not.toBeInTheDocument()
  })

  it('does not carry the notice or the typed values from signup to login', async () => {
    auth.signUp.mockResolvedValue({ data: { session: null }, error: null })
    renderAt('/signup')
    const user = await fill('new@b.test', 'secret1')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Check your email')
    await user.click(screen.getByRole('link', { name: 'Sign in' }))
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByLabelText(/Email/)).toHaveValue('')
    expect(screen.getByLabelText(/Password/)).toHaveValue('')
  })

  it('clears an old notice when the form is sent again', async () => {
    auth.signUp.mockResolvedValueOnce({ data: { session: null }, error: null })
    renderAt('/signup')
    const user = await fill('new@b.test', 'secret1')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByRole('status')).toBeInTheDocument()
    auth.signUp.mockReturnValue(new Promise(() => undefined))
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
  })

  it('works under StrictMode, which subscribes twice', async () => {
    auth.signInWithPassword.mockResolvedValue(OK)
    render(
      <StrictMode>
        <MemoryRouter initialEntries={['/login']}>
          <SessionProvider>
            <App />
          </SessionProvider>
        </MemoryRouter>
      </StrictMode>,
    )
    const user = await fill('a@b.test', 'secret1')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    await emit('SIGNED_IN', { user: {} })
    expect(await screen.findByRole('heading', { name: 'My projects' })).toBeInTheDocument()
  })
})

describe('submitting', () => {
  it('sends once when the button is pressed twice, and keeps the focus on it', async () => {
    auth.signInWithPassword.mockReturnValue(new Promise(() => undefined))
    renderAt('/login')
    const user = await fill('a@b.test', 'secret1')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    const button = await screen.findByRole('button', { name: 'Signing in…' })
    await user.click(button)
    await user.keyboard('{Enter}')
    expect(auth.signInWithPassword).toHaveBeenCalledOnce()
    expect(button).toHaveFocus()
  })

  it('trims the email before sending it', async () => {
    auth.signInWithPassword.mockResolvedValue(BAD)
    renderAt('/login')
    const user = await fill('  a@b.test  ', 'secret1')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.test', password: 'secret1' })
  })

  it('tells an invalid email from an empty one', async () => {
    renderAt('/login')
    const user = await fill('not-an-email', 'secret1')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(screen.getByLabelText(/Email/)).toHaveAccessibleDescription(/valid email/i)
  })

  it.each([
    ['email_not_confirmed', 400, 'Confirm your email first, then sign in.'],
    ['over_request_rate_limit', 429, 'Too many attempts. Wait a minute and try again.'],
    ['anything', 429, 'Too many attempts. Wait a minute and try again.'],
  ])('maps %s (%i) to its own message', async (code, status, text) => {
    auth.signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: { code, status, message: 'x' },
    })
    renderAt('/login')
    const user = await fill('a@b.test', 'secret1')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(text)
  })
})

describe('logout', () => {
  it('signs out from the home page and goes back to the sign-in page', async () => {
    renderAt('/login')
    await emit('SIGNED_IN', { user: {} })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' }))
    await emit('SIGNED_OUT', null)
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })
})

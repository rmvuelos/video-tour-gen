import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Listener = (event: string, session: object | null) => void
const auth = vi.hoisted(() => ({
  listener: null as Listener | null,
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
}))
vi.mock('../lib/supabase', () => ({
  getSupabase: () => ({
    auth: {
      signInWithPassword: auth.signInWithPassword,
      signUp: auth.signUp,
      signOut: auth.signOut,
      onAuthStateChange: (cb: Listener) => {
        auth.listener = cb
        cb('INITIAL_SESSION', null)
        return { data: { subscription: { unsubscribe: () => undefined } } }
      },
    },
  }),
}))

import { SessionProvider } from '../auth/session'
import { App } from '../App'

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
  auth.signOut.mockImplementation(async () => {
    auth.listener?.('SIGNED_OUT', null)
    return { error: null }
  })
})

async function fill(email: string, password: string) {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText(/Email/), email)
  await user.type(screen.getByLabelText(/Password/), password)
  return user
}

describe('/login', () => {
  it('signs in and returns to the route the user asked for', async () => {
    auth.signInWithPassword.mockImplementation(async () => {
      auth.listener?.('SIGNED_IN', { user: {} })
      return OK
    })
    renderAt('/login', { from: { pathname: '/' } })
    const user = await fill('a@b.test', 'secret1')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'a@b.test',
      password: 'secret1',
    })
    expect(await screen.findByRole('heading', { name: 'rooma' })).toBeInTheDocument()
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
    expect(await screen.findByRole('button', { name: 'Signing in…' })).toBeDisabled()
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
    auth.signUp.mockImplementation(async () => {
      auth.listener?.('SIGNED_IN', { user: {} })
      return OK
    })
    renderAt('/signup')
    const user = await fill('new@b.test', 'secret1')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByRole('heading', { name: 'rooma' })).toBeInTheDocument()
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

describe('logout', () => {
  it('signs out from the home page and goes back to the sign-in page', async () => {
    renderAt('/login')
    auth.listener?.('SIGNED_IN', { user: {} })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(auth.signOut).toHaveBeenCalledOnce())
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })
})

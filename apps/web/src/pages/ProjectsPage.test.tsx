import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Listener = (event: string, session: object | null) => void
const mock = vi.hoisted(() => ({ apiFetch: vi.fn(), listener: null as Listener | null }))
vi.mock('../lib/api', async (importActual) => ({
  ...(await importActual<typeof import('../lib/api')>()),
  apiFetch: mock.apiFetch,
}))
vi.mock('../lib/supabase', () => ({
  getSupabase: () => ({
    auth: {
      onAuthStateChange: (cb: Listener) => {
        mock.listener = cb
        cb('INITIAL_SESSION', { user: {} })
        return { data: { subscription: { unsubscribe: () => undefined } } }
      },
    },
  }),
}))

import { RequireAuth } from '../auth/RequireAuth'
import { SessionProvider } from '../auth/session'
import { ApiRequestError } from '../lib/api'
import { PAGE_SIZE } from '../lib/projects'
import { ProjectsPage } from './ProjectsPage'

const project = (n: number, status = 'draft') => ({
  id: `id-${n}`,
  name: `Project ${n}`,
  status,
  created_at: '2026-11-20T10:00:00Z',
})
const page = (items: object[], offset = 0) => ({ items, limit: PAGE_SIZE, offset })
const many = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => project(from + i))

beforeEach(() => mock.apiFetch.mockReset())

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/projects']}>
      <SessionProvider>
        <Routes>
          <Route path="/login" element={<h1>Sign in</h1>} />
          <Route element={<RequireAuth />}>
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/projects/:id" element={<h1>Opened project</h1>} />
          </Route>
        </Routes>
      </SessionProvider>
    </MemoryRouter>,
  )
}

describe('ProjectsPage list', () => {
  it('shows a loading status, then each project with its state and date', async () => {
    mock.apiFetch.mockResolvedValue(page([project(1, 'needs_fix'), project(2, 'ready')]))
    renderPage()
    expect(screen.getByRole('status')).toHaveTextContent('Loading projects')
    const link = await screen.findByRole('link', { name: 'Project 1' })
    expect(link).toHaveAttribute('href', '/projects/id-1')
    expect(screen.getByText('Needs fixes')).toBeInTheDocument()
    expect(screen.getByText('Ready')).toBeInTheDocument()
    expect(screen.getAllByText('Nov 20, 2026')).toHaveLength(2)
  })

  it('explains the empty state and still offers to create a project', async () => {
    mock.apiFetch.mockResolvedValue(page([]))
    renderPage()
    expect(await screen.findByText(/No projects yet/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create project' })).toBeInTheDocument()
  })

  it('shows the error and retries the same request', async () => {
    mock.apiFetch
      .mockRejectedValueOnce(new ApiRequestError(0, 'network_error', 'Could not reach the server.'))
      .mockResolvedValueOnce(page([project(1)]))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server.')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('link', { name: 'Project 1' })).toBeInTheDocument()
    expect(mock.apiFetch.mock.calls[1]?.[0]).toBe(mock.apiFetch.mock.calls[0]?.[0])
  })

  it('loads more by offset while pages come back full, then hides the button', async () => {
    mock.apiFetch
      .mockResolvedValueOnce(page(many(1, PAGE_SIZE)))
      .mockResolvedValueOnce(page(many(PAGE_SIZE + 1, 2), PAGE_SIZE))
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Load more' }))
    expect(await screen.findByRole('link', { name: `Project ${PAGE_SIZE + 2}` })).toBeVisible()
    expect(mock.apiFetch.mock.calls[1]?.[0]).toContain(`offset=${PAGE_SIZE}`)
    expect(screen.getByRole('link', { name: 'Project 1' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
  })

  it('keeps the loaded projects when loading more fails', async () => {
    mock.apiFetch
      .mockResolvedValueOnce(page(many(1, PAGE_SIZE)))
      .mockRejectedValueOnce(new ApiRequestError(500, 'internal_error', 'Server error.'))
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Load more' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Server error.')
    expect(screen.getByRole('link', { name: 'Project 1' })).toBeVisible()
  })

  it('cancels the request when the page unmounts', () => {
    let signal: AbortSignal | undefined
    mock.apiFetch.mockImplementationOnce((_path: string, init: { signal: AbortSignal }) => {
      signal = init.signal
      return new Promise(() => undefined)
    })
    renderPage().unmount()
    expect(signal?.aborted).toBe(true)
  })

  it('sends the user to login when the API answers 401', async () => {
    mock.apiFetch.mockImplementationOnce(() => {
      mock.listener?.('SIGNED_OUT', null)
      return Promise.reject(new ApiRequestError(401, 'unauthorized', 'Sign in again.'))
    })
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })
})

describe('ProjectsPage create', () => {
  beforeEach(() => mock.apiFetch.mockResolvedValueOnce(page([])))

  it('creates the project and opens it', async () => {
    mock.apiFetch.mockResolvedValueOnce(project(7))
    renderPage()
    await userEvent.type(await screen.findByLabelText(/Project name/), '  Loft  ')
    await userEvent.click(screen.getByRole('button', { name: 'Create project' }))
    expect(await screen.findByRole('heading', { name: 'Opened project' })).toBeInTheDocument()
    expect(mock.apiFetch).toHaveBeenLastCalledWith(
      '/projects',
      expect.objectContaining({ method: 'POST', body: { name: 'Loft' } }),
    )
  })

  it('validates the name before calling the API', async () => {
    renderPage()
    await screen.findByLabelText(/Project name/)
    await userEvent.click(screen.getByRole('button', { name: 'Create project' }))
    expect(screen.getByText('Enter a project name.')).toBeInTheDocument()
    expect(mock.apiFetch).toHaveBeenCalledTimes(1)
  })

  it('shows the message of an API failure', async () => {
    mock.apiFetch.mockRejectedValueOnce(
      new ApiRequestError(429, 'rate_limited', 'Too many requests.'),
    )
    renderPage()
    await userEvent.type(await screen.findByLabelText(/Project name/), 'Loft')
    await userEvent.click(screen.getByRole('button', { name: 'Create project' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Too many requests.'))
    expect(screen.queryByRole('heading', { name: 'Opened project' })).not.toBeInTheDocument()
  })
})

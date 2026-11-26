import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => ({ signOut: vi.fn(), session: undefined as unknown }))
vi.mock('../lib/supabase', () => ({ getSupabase: () => ({ auth: { signOut: mock.signOut } }) }))
vi.mock('../auth/session', () => ({ useSession: () => mock.session }))

import { AppShell } from './AppShell'

beforeEach(() => {
  mock.signOut.mockReset()
  mock.session = { user: { email: 'adri.martin@example.test' } }
})

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/projects" element={<h1>List page</h1>} />
          <Route path="/projects/:id" element={<h1>Detail page</h1>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('AppShell', () => {
  it('renders the routed page inside the main landmark', () => {
    renderAt('/projects')
    expect(
      within(screen.getByRole('main')).getByRole('heading', { name: 'List page' }),
    ).toBeInTheDocument()
  })

  it('shows the signed-in user at the foot of the sidebar', () => {
    renderAt('/projects')
    expect(screen.getByText('adri.martin')).toBeInTheDocument()
    expect(screen.getAllByText('AM').length).toBeGreaterThan(0)
  })

  it('marks My projects as the current page on the list', () => {
    renderAt('/projects')
    expect(screen.getByRole('link', { name: 'My projects' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('marks Upload assets as current on a project page', () => {
    renderAt('/projects/abc')
    expect(screen.getByRole('link', { name: /Upload assets/ })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('shows the breadcrumb for the current route', () => {
    renderAt('/projects/abc')
    const crumbs = within(screen.getByRole('navigation', { name: 'Breadcrumb' }))
    expect(crumbs.getByRole('link', { name: 'Projects' })).toHaveAttribute('href', '/projects')
    expect(crumbs.getByText('Project')).toHaveAttribute('aria-current', 'page')
  })

  it('navigates without a reload when a sidebar link is clicked', async () => {
    renderAt('/projects/abc')
    await userEvent.click(screen.getByRole('link', { name: 'My projects' }))
    expect(screen.getByRole('heading', { name: 'List page' })).toBeInTheDocument()
  })

  it('signs out of this browser only', async () => {
    renderAt('/projects')
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(mock.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('falls back to a neutral name when the session has no email', () => {
    mock.session = { user: {} }
    renderAt('/projects')
    expect(screen.getByText('You')).toBeInTheDocument()
  })
})

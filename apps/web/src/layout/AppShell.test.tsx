import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => ({ signOut: vi.fn(), session: undefined as unknown }))
vi.mock('../lib/supabase', () => ({ getSupabase: () => ({ auth: { signOut: mock.signOut } }) }))
vi.mock('../auth/session', () => ({ useSession: () => mock.session }))

import { PageTitle } from '../components/PageTitle'
import { useProjectCrumb } from '../lib/use-project-crumb'
import { AppShell } from './AppShell'

beforeEach(() => {
  mock.signOut.mockReset()
  mock.session = { user: { email: 'adri.martin@example.test' } }
})

function NamedDetail() {
  useProjectCrumb('Arles bedroom')
  return <PageTitle>Detail page</PageTitle>
}

function renderAt(path: string, detail = <PageTitle>Detail page</PageTitle>) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/projects" element={<PageTitle>List page</PageTitle>} />
          <Route path="/projects/:id" element={detail} />
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
    expect(screen.getAllByText('AD').length).toBeGreaterThan(0)
  })

  it('marks My projects as the current page on the list', () => {
    renderAt('/projects')
    expect(screen.getByRole('link', { name: 'My projects' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('keeps My projects current on a project page, never Upload assets', () => {
    renderAt('/projects/abc')
    expect(screen.getByRole('link', { name: 'My projects' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('link', { name: /Upload assets/ })).not.toHaveAttribute('aria-current')
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

  it('moves focus to the new page heading after navigating', async () => {
    renderAt('/projects/abc')
    await userEvent.click(screen.getByRole('link', { name: 'My projects' }))
    expect(screen.getByRole('heading', { name: 'List page' })).toHaveFocus()
  })

  it.each([{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { button: 1 }])(
    'leaves a modified click %j to the browser, to open another tab',
    (init) => {
      renderAt('/projects/abc')
      const link = screen.getByRole('link', { name: 'My projects' })
      // fireEvent returns false when the handler called preventDefault.
      const untouched = fireEvent.click(link, init)
      expect(untouched).toBe(true)
      expect(screen.getByRole('heading', { name: 'Detail page' })).toBeInTheDocument()
    },
  )

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

  it('shows the project name in the last crumb once the page supplies it', () => {
    renderAt('/projects/abc', <NamedDetail />)
    const crumbs = within(screen.getByRole('navigation', { name: 'Breadcrumb' }))
    expect(crumbs.getByText('Arles bedroom')).toHaveAttribute('aria-current', 'page')
    expect(crumbs.queryByText('Project')).not.toBeInTheDocument()
  })
})

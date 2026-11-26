import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => ({ apiFetch: vi.fn() }))
vi.mock('../lib/api', async (importActual) => ({
  ...(await importActual<typeof import('../lib/api')>()),
  apiFetch: mock.apiFetch,
}))

import { ApiRequestError } from '../lib/api'
import { ProjectPage } from './ProjectPage'

const project = (status = 'draft') => ({ id: 'p1', name: 'Loft', status, created_at: '' })

/** Answers the project and its file list by path; anything else never settles. */
function answer(status = 'draft') {
  mock.apiFetch.mockImplementation((path: string) =>
    path.endsWith('/files')
      ? Promise.resolve({ files: [] })
      : path === '/projects/p1'
        ? Promise.resolve(project(status))
        : new Promise(() => undefined),
  )
}

// A returned function would run as cleanup, so no arrow expression here.
beforeEach(() => {
  mock.apiFetch.mockReset()
})

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/projects/p1']}>
      <Routes>
        <Route
          path="/projects/:id"
          element={
            <>
              <Link to="/projects/p2">other</Link>
              <ProjectPage />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ProjectPage', () => {
  it('shows the project name as a focused, wrapping heading', async () => {
    answer()
    renderPage()
    const heading = await screen.findByRole('heading', { name: 'Loft' })
    await waitFor(() => expect(heading).toHaveFocus())
    expect(heading).toHaveClass('break-words')
  })

  it.each(['draft', 'needs_fix'])('shows the uploader for a %s project', async (status) => {
    answer(status)
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Photos' })).toBeInTheDocument()
  })

  it.each(['ingesting', 'ready'])('says a %s project cannot be changed', async (status) => {
    answer(status)
    renderPage()
    expect(
      await screen.findByText(/already sent, so its files can't be changed/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Photos' })).not.toBeInTheDocument()
  })

  it('forgets the previous project when the id changes', async () => {
    answer()
    renderPage()
    await screen.findByRole('heading', { name: 'Loft' })
    await userEvent.click(screen.getByRole('link', { name: 'other' }))
    expect(screen.getByText('Loading project…')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Loft' })).not.toBeInTheDocument()
  })

  it('says so when the project does not exist', async () => {
    mock.apiFetch.mockRejectedValueOnce(new ApiRequestError(404, 'not_found', 'Project not found.'))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('Project not found.')
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
})

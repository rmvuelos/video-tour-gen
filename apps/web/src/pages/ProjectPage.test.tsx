import { render, screen } from '@testing-library/react'
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

beforeEach(() => mock.apiFetch.mockReset())

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
    mock.apiFetch.mockResolvedValueOnce({ id: 'p1', name: 'Loft', status: 'draft', created_at: '' })
    renderPage()
    const heading = await screen.findByRole('heading', { name: 'Loft' })
    expect(heading).toHaveFocus()
    expect(heading).toHaveClass('break-words')
  })

  it('does not link to the upload step until it exists', async () => {
    mock.apiFetch.mockResolvedValueOnce({ id: 'p1', name: 'Loft', status: 'draft', created_at: '' })
    renderPage()
    await screen.findByRole('heading', { name: 'Loft' })
    expect(screen.queryByRole('link', { name: /Upload assets/ })).not.toBeInTheDocument()
    expect(screen.getByText(/Uploading assets is coming soon/)).toBeInTheDocument()
  })

  it('forgets the previous project when the id changes', async () => {
    mock.apiFetch
      .mockResolvedValueOnce({ id: 'p1', name: 'Loft', status: 'draft', created_at: '' })
      .mockReturnValueOnce(new Promise(() => undefined))
    renderPage()
    await screen.findByRole('heading', { name: 'Loft' })
    await userEvent.click(screen.getByRole('link', { name: 'other' }))
    expect(screen.getByRole('status')).toHaveTextContent('Loading project')
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

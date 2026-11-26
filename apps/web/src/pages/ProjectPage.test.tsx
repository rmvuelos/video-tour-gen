import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
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
        <Route path="/projects/:id" element={<ProjectPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ProjectPage', () => {
  it('shows the project name and a link to the upload step', async () => {
    mock.apiFetch.mockResolvedValueOnce({ id: 'p1', name: 'Loft', status: 'draft', created_at: '' })
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Loft' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Upload assets' })).toHaveAttribute(
      'href',
      '/projects/p1/upload',
    )
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

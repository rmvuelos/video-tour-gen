import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

  it('says a ready project is ready, with no next step yet', async () => {
    answer('ready')
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Your files are ready' })).toHaveFocus()
    expect(await screen.findByRole('heading', { name: 'Your files are ready' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /preflight/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Photos' })).not.toBeInTheDocument()
  })

  it('follows the ingest of an ingesting project and shows the result when it is done', async () => {
    let status = 'ingesting'
    mock.apiFetch.mockImplementation((path: string) => {
      if (path.endsWith('/jobs/latest')) {
        status = 'ready'
        return Promise.resolve({ id: 'j', status: 'done', error_code: null, files: [] })
      }
      return Promise.resolve(project(status))
    })
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Your files are ready' })).toBeInTheDocument()
    expect(mock.apiFetch.mock.calls.filter(([path]) => path === '/projects/p1')).toHaveLength(2)
  })

  it('returns to the uploader with the invalid files marked when the ingest needs fixes', async () => {
    let status = 'ingesting'
    mock.apiFetch.mockImplementation((path: string) => {
      if (path.endsWith('/jobs/latest')) {
        status = 'needs_fix'
        return Promise.resolve({ id: 'j', status: 'done', error_code: null, files: [] })
      }
      if (path.endsWith('/files')) {
        return Promise.resolve({
          files: [
            {
              id: 'f1',
              kind: 'photo',
              filename: 'a.jpg',
              size: 1,
              mime: 'image/jpeg',
              status: 'invalid',
              error_code: 'corrupt_file',
              page_index: null,
            },
            {
              id: 'f2',
              kind: 'photo',
              filename: 'b.jpg',
              size: 1,
              mime: 'image/jpeg',
              status: 'invalid',
              error_code: 'too_large_pixels',
              page_index: null,
            },
          ],
        })
      }
      return Promise.resolve(project(status))
    })
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Photos' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('2 files need fixing')
    expect(
      screen.getByText('The file is damaged or unreadable. Choose another one.'),
    ).toBeInTheDocument()
    expect(screen.getByText(/too many pixels/)).toBeInTheDocument()
  })

  it('prefills the details of the project in the uploader', async () => {
    mock.apiFetch.mockImplementation((path: string) =>
      path.endsWith('/files')
        ? Promise.resolve({ files: [] })
        : Promise.resolve({ ...project('needs_fix'), area_m2: 64.5, description: 'North light' }),
    )
    renderPage()
    expect(await screen.findByLabelText('Area (m²)')).toHaveValue('64.5')
    expect(screen.getByLabelText('Description')).toHaveValue('North light')
  })

  it('switches to the ingest view after a successful submit', async () => {
    const files = [
      {
        id: 'pl',
        kind: 'plan',
        filename: 'plan.pdf',
        size: 1,
        mime: 'application/pdf',
        status: 'pending',
        error_code: null,
        page_index: null,
      },
      ...[1, 2, 3].map((n) => ({
        id: `p${n}`,
        kind: 'photo',
        filename: `p${n}.jpg`,
        size: 1,
        mime: 'image/jpeg',
        status: 'pending',
        error_code: null,
        page_index: null,
      })),
    ]
    mock.apiFetch.mockImplementation((path: string, init?: { method?: string }) => {
      if (path.endsWith('/submit')) return Promise.resolve({ id: 'j', status: 'queued' })
      if (path.endsWith('/jobs/latest'))
        return Promise.resolve({ id: 'j', status: 'queued', error_code: null, files: [] })
      if (path.endsWith('/files')) return Promise.resolve({ files })
      return init?.method ? Promise.reject(new Error(path)) : Promise.resolve(project('draft'))
    })
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Check my files' }))
    expect(
      await screen.findByText('Waiting to start…', { selector: 'p:not(.sr-only)' }),
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

describe('ProjectPage reading the result of the ingest', () => {
  const done = { id: 'j', status: 'done', error_code: null, files: [] }
  const tick = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  /** Each entry answers one GET of the project, in order (the last one repeats). */
  function ingestWith(reads: (() => unknown)[]) {
    let n = 0
    mock.apiFetch.mockImplementation((path: string) => {
      if (path.endsWith('/jobs/latest')) return Promise.resolve(done)
      if (path.endsWith('/files')) return Promise.resolve({ files: [] })
      const read = reads[Math.min(n++, reads.length - 1)]!
      return Promise.resolve().then(read)
    })
  }
  const ingesting = () => project('ingesting')
  const ready = () => project('ready')
  const down = () => {
    throw new ApiRequestError(0, 'network_error', 'Could not reach the server.')
  }
  const reads = () => mock.apiFetch.mock.calls.filter(([path]) => path === '/projects/p1').length

  it('keeps the view and reads again after 2 s when it still reads ingesting', async () => {
    ingestWith([ingesting, ingesting, ready])
    renderPage()
    await tick(100)
    expect(screen.getByRole('heading', { name: 'Checking your files' })).toBeInTheDocument()
    expect(reads()).toBe(2)
    await tick(2000)
    expect(screen.getByRole('heading', { name: 'Your files are ready' })).toBeInTheDocument()
  })

  it('keeps the view through network errors on the re-read', async () => {
    ingestWith([ingesting, down, ready])
    renderPage()
    await tick(100)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Checking your files' })).toBeInTheDocument()
    await tick(2000)
    expect(screen.getByRole('heading', { name: 'Your files are ready' })).toBeInTheDocument()
  })

  it('shows the error with Try again after 5 failed re-reads, and Try again reads once more', async () => {
    ingestWith([ingesting, down])
    renderPage()
    // One act per step: React renders the next read only when an act ends.
    for (let i = 0; i < 6; i++) await tick(2000)
    expect(screen.getByRole('alert')).toHaveTextContent('Could not reach the server.')
    ingestWith([ready])
    await act(async () => screen.getByRole('button', { name: 'Try again' }).click())
    await tick(100)
    expect(screen.getByRole('heading', { name: 'Your files are ready' })).toBeInTheDocument()
  })
})

describe('ProjectPage heading', () => {
  it.each(['draft', 'needs_fix'])(
    'hides the h1 visually in the upload view (%s)',
    async (status) => {
      answer(status)
      renderPage()
      expect(await screen.findByRole('heading', { name: 'Loft', level: 1 })).toHaveClass('sr-only')
    },
  )

  it.each(['ingesting', 'ready'])('shows the h1 in the %s view', async (status) => {
    answer(status)
    renderPage()
    const heading = await screen.findByRole('heading', { name: 'Loft', level: 1 })
    expect(heading).not.toHaveClass('sr-only')
  })
})

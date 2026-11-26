import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ getLatestJob: vi.fn(), retryIngest: vi.fn() }))
vi.mock('../lib/uploads', () => api)

import { IngestStatus } from './IngestStatus'

const file = (id: string, status: string) => ({ id, kind: 'photo', status, error_code: null })
const job = (status: string, over: object = {}) => ({
  id: 'j1',
  project_id: 'p1',
  status,
  error_code: null,
  files: [],
  ...over,
})
const tick = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))
const live = () => screen.getByRole('status')

beforeEach(() => {
  vi.useFakeTimers()
  api.getLatestJob.mockReset()
  api.retryIngest.mockReset()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('IngestStatus', () => {
  it('says the job is waiting, with an indeterminate bar', async () => {
    api.getLatestJob.mockResolvedValue(job('queued'))
    render(<IngestStatus projectId="p1" onSettled={vi.fn()} />)
    await tick(0)
    expect(live()).toHaveTextContent('Waiting to start…')
    expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow')
  })

  it('shows files checked so far as text and as the bar value', async () => {
    api.getLatestJob.mockResolvedValue(
      job('running', {
        files: [
          file('a', 'valid'),
          file('b', 'invalid'),
          file('c', 'uploaded'),
          file('d', 'uploaded'),
        ],
      }),
    )
    render(<IngestStatus projectId="p1" onSettled={vi.fn()} />)
    await tick(0)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50')
    expect(screen.getByText('2 of 4 files checked')).toBeInTheDocument()
  })

  it('changes the live region only when the state changes, not on every poll', async () => {
    api.getLatestJob
      .mockResolvedValueOnce(
        job('running', { files: [file('a', 'uploaded'), file('b', 'uploaded')] }),
      )
      .mockResolvedValueOnce(job('running', { files: [file('a', 'valid'), file('b', 'uploaded')] }))
      .mockResolvedValue(job('running', { files: [file('a', 'valid'), file('b', 'valid')] }))
    render(<IngestStatus projectId="p1" onSettled={vi.fn()} />)
    await tick(0)
    const changes: string[] = []
    const watch = new MutationObserver(() => changes.push(live().textContent ?? ''))
    watch.observe(live(), { childList: true, characterData: true, subtree: true })
    await tick(2000)
    await tick(2000)
    expect(screen.getByText('2 of 2 files checked')).toBeInTheDocument()
    expect(watch.takeRecords()).toEqual([])
    expect(changes).toEqual([])
    expect(live()).toHaveTextContent('Checking your files…')
    watch.disconnect()
  })

  it('calls onSettled once when the job is done', async () => {
    api.getLatestJob.mockResolvedValue(job('done'))
    const onSettled = vi.fn()
    render(<IngestStatus projectId="p1" onSettled={onSettled} />)
    await tick(0)
    expect(onSettled).toHaveBeenCalledTimes(1)
    expect(live()).toHaveTextContent('Finishing up…')
  })

  it('explains a failed job and polls again after Try again', async () => {
    api.getLatestJob.mockResolvedValueOnce(job('failed', { error_code: 'worker_lost' }))
    api.getLatestJob.mockResolvedValue(job('running'))
    api.retryIngest.mockResolvedValue(job('queued'))
    render(<IngestStatus projectId="p1" onSettled={vi.fn()} />)
    await tick(0)
    expect(screen.getByRole('alert')).toHaveTextContent('Processing was interrupted. Try again.')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Try again' })))
    expect(api.retryIngest).toHaveBeenCalledWith('p1', expect.any(AbortSignal))
    await tick(0)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(live()).toHaveTextContent('Checking your files…')
  })

  it('shows a retry error and keeps the button', async () => {
    api.getLatestJob.mockResolvedValue(job('failed', { error_code: 'worker_lost' }))
    api.retryIngest.mockRejectedValue(new Error('boom'))
    render(<IngestStatus projectId="p1" onSettled={vi.fn()} />)
    await tick(0)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Try again' })))
    expect(screen.getByText('Something went wrong. Try again.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled()
  })

  it('tells the user when progress cannot be read, then recovers', async () => {
    api.getLatestJob
      .mockRejectedValueOnce(new Error('x'))
      .mockRejectedValueOnce(new Error('x'))
      .mockResolvedValue(job('running'))
    render(<IngestStatus projectId="p1" onSettled={vi.fn()} />)
    await tick(0)
    await tick(4000)
    expect(screen.getByText(/Can't check the progress right now/)).toBeInTheDocument()
    await tick(8000)
    expect(screen.queryByText(/Can't check the progress right now/)).not.toBeInTheDocument()
  })
})

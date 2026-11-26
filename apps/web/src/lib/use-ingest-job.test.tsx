import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiRequestError } from './api'

const api = vi.hoisted(() => ({ getLatestJob: vi.fn(), retryIngest: vi.fn() }))
vi.mock('./uploads', () => api)

import { useIngestJob } from './use-ingest-job'

const job = (status: string, over: object = {}) => ({
  id: 'j1',
  project_id: 'p1',
  status,
  error_code: null,
  files: [],
  ...over,
})
const tick = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))

function setup() {
  const onSettled = vi.fn()
  const view = renderHook(() => useIngestJob('p1', onSettled))
  return { ...view, onSettled }
}

beforeEach(() => {
  vi.useFakeTimers()
  api.getLatestJob.mockReset()
  api.retryIngest.mockReset()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('useIngestJob', () => {
  it('polls at once and then every 2 seconds while the job is active', async () => {
    api.getLatestJob.mockResolvedValue(job('running'))
    const { result } = setup()
    await tick(0)
    expect(api.getLatestJob).toHaveBeenCalledTimes(1)
    expect(result.current.job?.status).toBe('running')
    await tick(1999)
    expect(api.getLatestJob).toHaveBeenCalledTimes(1)
    await tick(1)
    expect(api.getLatestJob).toHaveBeenCalledTimes(2)
    await tick(2000)
    expect(api.getLatestJob).toHaveBeenCalledTimes(3)
  })

  it.each(['done', 'failed'])('stops on %s and settles once', async (status) => {
    api.getLatestJob.mockResolvedValueOnce(job('running')).mockResolvedValue(job(status))
    const { onSettled } = setup()
    await tick(0)
    await tick(2000)
    expect(onSettled).toHaveBeenCalledTimes(1)
    expect(onSettled).toHaveBeenCalledWith(expect.objectContaining({ status }))
    await tick(20_000)
    expect(api.getLatestJob).toHaveBeenCalledTimes(2)
    expect(onSettled).toHaveBeenCalledTimes(1)
  })

  it('stops polling and aborts the request on unmount', async () => {
    api.getLatestJob.mockReturnValue(new Promise(() => undefined))
    const { unmount } = setup()
    await tick(0)
    const signal = api.getLatestJob.mock.calls[0]![1] as AbortSignal
    unmount()
    expect(signal.aborted).toBe(true)
    await tick(10_000)
    expect(api.getLatestJob).toHaveBeenCalledTimes(1)
  })

  it('backs off after errors, counts them and recovers', async () => {
    api.getLatestJob
      .mockRejectedValueOnce(new ApiRequestError(500, 'internal_error', 'x'))
      .mockRejectedValueOnce(new ApiRequestError(0, 'network_error', 'x'))
      .mockResolvedValue(job('running'))
    const { result } = setup()
    await tick(0)
    expect(result.current.failures).toBe(1)
    await tick(3999)
    expect(api.getLatestJob).toHaveBeenCalledTimes(1)
    await tick(1)
    expect(api.getLatestJob).toHaveBeenCalledTimes(2)
    expect(result.current.failures).toBe(2)
    await tick(8000)
    expect(api.getLatestJob).toHaveBeenCalledTimes(3)
    expect(result.current.failures).toBe(0)
    await tick(2000)
    expect(api.getLatestJob).toHaveBeenCalledTimes(4)
  })

  it('does not request while the tab is hidden and polls again when it shows', async () => {
    api.getLatestJob.mockResolvedValue(job('running'))
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    setup()
    await tick(10_000)
    expect(api.getLatestJob).not.toHaveBeenCalled()
    hidden.mockReturnValue(false)
    await act(async () => void document.dispatchEvent(new Event('visibilitychange')))
    await tick(0)
    expect(api.getLatestJob).toHaveBeenCalledTimes(1)
    hidden.mockRestore()
  })

  it('retries a failed ingest and resumes polling', async () => {
    api.getLatestJob.mockResolvedValueOnce(job('failed', { error_code: 'worker_lost' }))
    api.getLatestJob.mockResolvedValue(job('running'))
    api.retryIngest.mockResolvedValue(job('queued'))
    const { result, onSettled } = setup()
    await tick(0)
    expect(onSettled).toHaveBeenCalledTimes(1)
    await act(() => result.current.retry())
    expect(api.retryIngest).toHaveBeenCalledWith('p1', expect.any(AbortSignal))
    await tick(0)
    expect(result.current.job?.status).toBe('running')
    await tick(2000)
    expect(api.getLatestJob.mock.calls.length).toBeGreaterThanOrEqual(3)
  })

  it('treats a 409 job_not_failed as someone else retrying: resume, no error', async () => {
    api.getLatestJob.mockResolvedValueOnce(job('failed', { error_code: 'worker_lost' }))
    api.getLatestJob.mockResolvedValue(job('running'))
    api.retryIngest.mockRejectedValue(new ApiRequestError(409, 'job_not_failed', 'x'))
    const { result } = setup()
    await tick(0)
    await act(() => result.current.retry())
    await tick(0)
    expect(result.current.retryError).toBeNull()
    expect(result.current.job?.status).toBe('running')
  })

  it('reports a retry that the server refuses and keeps the failed job', async () => {
    api.getLatestJob.mockResolvedValue(job('failed', { error_code: 'worker_lost' }))
    api.retryIngest.mockRejectedValue(new ApiRequestError(503, 'enqueue_failed', 'x'))
    const { result } = setup()
    await tick(0)
    await act(() => result.current.retry())
    expect(result.current.retryError).toBe('We could not start processing. Try again in a moment.')
    expect(result.current.job?.status).toBe('failed')
    expect(result.current.retrying).toBe(false)
  })

  it('ignores a second retry while one is in flight', async () => {
    api.getLatestJob.mockResolvedValue(job('failed', { error_code: 'worker_lost' }))
    api.retryIngest.mockReturnValue(new Promise(() => undefined))
    const { result } = setup()
    await tick(0)
    act(() => void result.current.retry())
    act(() => void result.current.retry())
    expect(api.retryIngest).toHaveBeenCalledTimes(1)
    expect(result.current.retrying).toBe(true)
  })

  it.each([403, 404])('stops polling for good on a %i', async (status) => {
    api.getLatestJob.mockRejectedValue(new ApiRequestError(status, 'not_found', 'x'))
    const { result } = setup()
    await tick(0)
    await tick(60_000)
    expect(api.getLatestJob).toHaveBeenCalledTimes(1)
    expect(result.current.fatal).toBe(true)
  })

  it('gives up on a request that hangs and tries again with backoff', async () => {
    api.getLatestJob.mockImplementationOnce(
      (_p: string, signal: AbortSignal) =>
        new Promise((_, reject) =>
          signal.addEventListener('abort', () => reject(new DOMException('x', 'AbortError'))),
        ),
    )
    api.getLatestJob.mockResolvedValue(job('running'))
    const { result } = setup()
    await tick(14_999)
    expect(result.current.failures).toBe(0)
    await tick(1)
    expect(result.current.failures).toBe(1)
    await tick(4000)
    expect(api.getLatestJob).toHaveBeenCalledTimes(2)
    expect(result.current.job?.status).toBe('running')
  })
})

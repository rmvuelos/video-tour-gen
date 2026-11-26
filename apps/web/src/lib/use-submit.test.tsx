import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiRequestError } from './api'

const api = vi.hoisted(() => ({ submitProject: vi.fn() }))
vi.mock('./uploads', () => api)

import { useSubmit } from './use-submit'

const job = { id: 'j1', project_id: 'p1', status: 'queued', created_at: '' }
const options = { plan_page_index: 0, area_m2: 80, description: 'Sunny' }

function setup() {
  const onSubmitted = vi.fn()
  const onFileErrors = vi.fn()
  const view = renderHook(() => useSubmit('p1', { onSubmitted, onFileErrors }))
  return { ...view, onSubmitted, onFileErrors }
}

const rejectWith = (e: unknown) =>
  api.submitProject.mockImplementation(async () => {
    throw e
  })

beforeEach(() => {
  api.submitProject.mockReset()
})

describe('useSubmit', () => {
  it('sends the options and reports the job', async () => {
    api.submitProject.mockResolvedValue(job)
    const { result, onSubmitted } = setup()
    await act(() => result.current.submit(options))
    expect(api.submitProject).toHaveBeenCalledWith('p1', options, expect.any(AbortSignal))
    expect(onSubmitted).toHaveBeenCalledWith(job)
    expect(result.current.error).toBeNull()
  })

  it('ignores a second submit while one is in flight', async () => {
    let resolve!: (j: object) => void
    api.submitProject.mockReturnValue(new Promise((r) => (resolve = r)))
    const { result } = setup()
    act(() => void result.current.submit(options))
    act(() => void result.current.submit(options))
    expect(result.current.submitting).toBe(true)
    expect(api.submitProject).toHaveBeenCalledTimes(1)
    await act(async () => resolve(job))
  })

  it('maps a 422 with file details to per-file messages', async () => {
    rejectWith(
      new ApiRequestError(422, 'invalid_files', 'x', [
        { code: 'missing_object', message: 'm', file_id: 'f1' },
        { code: 'size_mismatch', message: 'm', file_id: 'f2' },
      ]),
    )
    const { result, onFileErrors, onSubmitted } = setup()
    await act(() => result.current.submit(options))
    expect(onFileErrors).toHaveBeenCalledWith([
      { id: 'f1', error: 'The upload did not finish. Upload the file again.' },
      { id: 'f2', error: 'The uploaded file does not match the chosen one. Upload it again.' },
    ])
    expect(onSubmitted).not.toHaveBeenCalled()
    expect(result.current.submitting).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('shows a general 422 detail without a file as the error', async () => {
    rejectWith(
      new ApiRequestError(422, 'invalid_files', 'x', [{ code: 'missing_plan', message: 'm' }]),
    )
    const { result, onFileErrors } = setup()
    await act(() => result.current.submit(options))
    expect(onFileErrors).not.toHaveBeenCalled()
    expect(result.current.error).toBe('Add the floor plan.')
  })

  it.each([
    [409, 'files_changed', 'The files changed while sending. Review them and try again.'],
    [409, 'project_not_editable', "This project was already sent, so its files can't be changed."],
    [503, 'enqueue_failed', 'We could not start processing. Try again in a moment.'],
    [429, 'rate_limited', 'Too many requests. Wait a moment and try again.'],
    [500, 'internal_error', 'Something went wrong. Try again.'],
  ])('shows the message of %i %s and allows sending again', async (status, code, text) => {
    api.submitProject.mockRejectedValueOnce(new ApiRequestError(status, code, 'raw'))
    const { result, onSubmitted } = setup()
    await act(() => result.current.submit(options))
    expect(result.current.error).toBe(text)
    expect(result.current.submitting).toBe(false)
    api.submitProject.mockResolvedValue(job)
    await act(() => result.current.submit(options))
    expect(onSubmitted).toHaveBeenCalledTimes(1)
    expect(result.current.error).toBeNull()
  })

  it('aborts the request on unmount without reporting', async () => {
    let signal!: AbortSignal
    api.submitProject.mockImplementation(
      (_p: string, _o: object, s: AbortSignal) =>
        new Promise((_, reject) => {
          signal = s
          s.addEventListener('abort', () => reject(new DOMException('x', 'AbortError')))
        }),
    )
    const { result, unmount, onSubmitted } = setup()
    act(() => void result.current.submit(options))
    unmount()
    expect(signal.aborted).toBe(true)
    await Promise.resolve()
    expect(onSubmitted).not.toHaveBeenCalled()
  })
})

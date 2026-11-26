import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiFetch = vi.hoisted(() => vi.fn())
vi.mock('./api', () => ({ apiFetch }))

import {
  deleteFile,
  getLatestJob,
  listFiles,
  registerFiles,
  retryIngest,
  submitProject,
} from './uploads'

const signal = new AbortController().signal

describe('uploads requests', () => {
  beforeEach(() => apiFetch.mockReset().mockResolvedValue('result'))

  it('lists files of a project', async () => {
    await expect(listFiles('p 1', signal)).resolves.toBe('result')
    expect(apiFetch).toHaveBeenCalledWith('/projects/p%201/files', { signal })
  })

  it('registers files with a POST body', async () => {
    const files = [{ kind: 'photo' as const, filename: 'a.jpg', size: 3, mime: 'image/jpeg' }]
    await registerFiles('p1', files)
    expect(apiFetch).toHaveBeenCalledWith('/projects/p1/files', {
      method: 'POST',
      body: { files },
      signal: null,
    })
  })

  it('deletes one file, encoding both ids', async () => {
    await deleteFile('p/1', 'f?1', signal)
    expect(apiFetch).toHaveBeenCalledWith('/projects/p%2F1/files/f%3F1', {
      method: 'DELETE',
      signal,
    })
  })

  it('submits with the given options', async () => {
    await submitProject('p1', { plan_page_index: 2, area_m2: 80 })
    expect(apiFetch).toHaveBeenCalledWith('/projects/p1/submit', {
      method: 'POST',
      body: { plan_page_index: 2, area_m2: 80 },
      signal: null,
    })
  })

  it('submits an empty body when there are no options', async () => {
    await submitProject('p1')
    expect(apiFetch).toHaveBeenCalledWith('/projects/p1/submit', {
      method: 'POST',
      body: {},
      signal: null,
    })
  })

  it('gets the latest job', async () => {
    await getLatestJob('p1', signal)
    expect(apiFetch).toHaveBeenCalledWith('/projects/p1/jobs/latest', { signal })
  })

  it('retries the ingest with a POST', async () => {
    await retryIngest('p1')
    expect(apiFetch).toHaveBeenCalledWith('/projects/p1/jobs/ingest/retry', {
      method: 'POST',
      signal: null,
    })
  })
})

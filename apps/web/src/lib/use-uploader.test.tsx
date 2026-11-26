import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiRequestError } from './api'
import { PutUploadError } from './put-upload'

const api = vi.hoisted(() => ({
  listFiles: vi.fn(),
  registerFiles: vi.fn(),
  deleteFile: vi.fn(),
  putUpload: vi.fn(),
}))
vi.mock('./uploads', () => ({
  listFiles: api.listFiles,
  registerFiles: api.registerFiles,
  deleteFile: api.deleteFile,
}))
vi.mock('./put-upload', async (orig) => ({
  ...(await orig<typeof import('./put-upload')>()),
  putUpload: api.putUpload,
}))

import { useUploader } from './use-uploader'

type PutCall = {
  file: File
  signal: AbortSignal
  progress: (n: number) => void
  resolve: () => void
  reject: (e: unknown) => void
}
let puts: PutCall[] = []
let nextId = 0

const serverFile = (id: string, over: object = {}) => ({
  id,
  kind: 'photo',
  filename: `${id}.jpg`,
  size: 1,
  mime: 'image/jpeg',
  status: 'pending',
  error_code: null,
  page_index: null,
  ...over,
})
const photo = (name: string) => new File(['x'], name, { type: 'image/jpeg' })
const abortError = () => new DOMException('cancelled', 'AbortError')

async function setup(files: object[] = []) {
  api.listFiles.mockResolvedValue({ files })
  const hook = renderHook(() => useUploader('p1'))
  await waitFor(() => expect(hook.result.current.phase).toBe('ready'))
  return hook
}

beforeEach(() => {
  puts = []
  nextId = 0
  Object.values(api).forEach((m) => m.mockReset())
  api.deleteFile.mockResolvedValue(undefined)
  api.registerFiles.mockImplementation(
    async (_p: string, files: { kind: string; filename: string }[]) => ({
      files: files.map((f) => ({
        file_id: `n${++nextId}`,
        kind: f.kind,
        mime: 'image/jpeg',
        upload_url: `https://s/${nextId}`,
        headers: {},
      })),
    }),
  )
  api.putUpload.mockImplementation(
    (_url: string, _h: object, file: File, o: { signal: AbortSignal; onProgress: () => void }) =>
      new Promise<void>((resolve, reject) => {
        o.signal.addEventListener('abort', () => reject(abortError()))
        puts.push({ file, signal: o.signal, progress: o.onProgress, resolve, reject })
      }),
  )
})

describe('useUploader loading', () => {
  it('lists the server files with slots, counts and a submit hint', async () => {
    const { result } = await setup([
      serverFile('a'),
      serverFile('b', { status: 'invalid', error_code: 'corrupt_file' }),
      serverFile('c', { kind: 'plan', filename: 'plan.pdf' }),
    ])
    expect(result.current.items.map((i) => i.id)).toEqual(['a', 'b', 'c'])
    expect(result.current.items[1]).toMatchObject({
      status: 'invalid',
      error: 'The file is damaged or unreadable. Choose another one.',
    })
    expect(result.current.items[0]?.file).toBeUndefined()
    expect(result.current.counts).toEqual({ plan: 1, photo: 2 })
    expect(result.current.slots).toEqual({ plan: 0, photo: 8 })
    expect(result.current.submit).toEqual({
      ok: false,
      reason: 'Add at least 1 more photo.',
    })
  })

  it('reports a load error and loads again on reload', async () => {
    api.listFiles.mockRejectedValueOnce(new ApiRequestError(500, 'internal_error', 'x'))
    const { result } = renderHook(() => useUploader('p1'))
    await waitFor(() => expect(result.current.phase).toBe('error'))
    expect(result.current.loadError).toBe('Something went wrong. Try again.')
    api.listFiles.mockResolvedValue({ files: [serverFile('a')] })
    act(() => result.current.reload())
    await waitFor(() => expect(result.current.phase).toBe('ready'))
    expect(result.current.items).toHaveLength(1)
  })

  it('aborts the list request when the project changes', async () => {
    api.listFiles.mockResolvedValue({ files: [] })
    const { rerender } = renderHook(({ id }) => useUploader(id), { initialProps: { id: 'p1' } })
    const first = api.listFiles.mock.calls[0]![1] as AbortSignal
    rerender({ id: 'p2' })
    expect(first.aborted).toBe(true)
    expect(api.listFiles).toHaveBeenLastCalledWith('p2', expect.any(AbortSignal))
  })
})

describe('useUploader add', () => {
  it('registers once per drop, shows progress, then done and announces', async () => {
    const { result } = await setup()
    await act(async () => {
      void result.current.add('photo', [photo('a.jpg'), photo('b.jpg')])
    })
    expect(api.registerFiles).toHaveBeenCalledTimes(1)
    expect(result.current.items).toMatchObject([
      { id: 'n1', status: 'uploading', progress: 0, filename: 'a.jpg' },
      { id: 'n2', status: 'uploading', filename: 'b.jpg' },
    ])
    expect(result.current.items[0]?.file).toBeInstanceOf(File)
    act(() => puts[0]!.progress(0.5))
    expect(result.current.items[0]?.progress).toBe(0.5)
    await act(async () => puts.forEach((p) => p.resolve()))
    expect(result.current.items.map((i) => i.status)).toEqual(['pending', 'pending'])
    expect(result.current.announcement).toBe('2 photos uploaded')
  })

  it('uploads at most three files at once', async () => {
    const { result } = await setup()
    const files = ['a', 'b', 'c', 'd', 'e'].map((n) => photo(`${n}.jpg`))
    await act(async () => {
      void result.current.add('photo', files)
    })
    expect(puts).toHaveLength(3)
    await act(async () => puts[0]!.resolve())
    expect(puts).toHaveLength(4)
  })

  it('marks a failed PUT, announces it, and retries the same URL', async () => {
    const { result } = await setup()
    await act(async () => {
      void result.current.add('photo', [photo('hall.jpg')])
    })
    await act(async () => puts[0]!.reject(new PutUploadError('network_error', 'x')))
    expect(result.current.items[0]).toMatchObject({
      status: 'failed',
      error: 'Could not reach the server. Check your connection and retry.',
    })
    expect(result.current.announcement).toBe('hall.jpg failed to upload. Retry or remove it.')
    await act(async () => {
      void result.current.retry('n1')
    })
    expect(result.current.items[0]?.status).toBe('uploading')
    expect(api.putUpload.mock.calls[1]![0]).toBe('https://s/1')
    await act(async () => puts[1]!.resolve())
    expect(result.current.items[0]?.status).toBe('pending')
  })

  it('deletes and registers again when the signed URL has expired', async () => {
    const { result } = await setup()
    await act(async () => {
      void result.current.add('photo', [photo('hall.jpg')])
    })
    await act(async () => puts[0]!.reject(new PutUploadError('http_error', 'x', 403)))
    await act(async () => {
      void result.current.retry('n1')
    })
    await act(async () => puts[1]!.reject(new PutUploadError('http_error', 'x', 403)))
    expect(api.deleteFile).toHaveBeenCalledWith('p1', 'n1', expect.any(AbortSignal))
    expect(api.registerFiles).toHaveBeenCalledTimes(2)
    expect(result.current.items[0]).toMatchObject({ id: 'n2', status: 'uploading' })
    await act(async () => puts[2]!.resolve())
    expect(result.current.items[0]).toMatchObject({ id: 'n2', status: 'pending' })
  })

  it('shows per-file reasons for a 422 and adds nothing', async () => {
    api.registerFiles.mockRejectedValue(
      new ApiRequestError(422, 'invalid_files', 'x', [
        { code: 'too_large', message: 'm', filename: 'big.jpg' },
      ]),
    )
    const { result } = await setup()
    await act(async () => result.current.add('photo', [photo('big.jpg')]))
    expect(result.current.error).toBe(
      'big.jpg: The file is too large. Reduce it or choose another.',
    )
    expect(result.current.items).toEqual([])
    expect(api.putUpload).not.toHaveBeenCalled()
  })

  it.each([
    [409, 'project_not_editable', "This project was already sent, so its files can't be changed."],
    [429, 'rate_limited', 'Too many requests. Wait a moment and try again.'],
  ])('shows a hook error for register %i', async (status, code, message) => {
    api.registerFiles.mockRejectedValue(new ApiRequestError(status, code, 'x'))
    const { result } = await setup()
    await act(async () => result.current.add('photo', [photo('a.jpg')]))
    expect(result.current.error).toBe(message)
    expect(result.current.items).toEqual([])
  })
})

describe('useUploader remove', () => {
  it('aborts an in-flight upload and deletes the row', async () => {
    const { result } = await setup()
    await act(async () => {
      void result.current.add('photo', [photo('salon.jpg')])
    })
    await act(async () => result.current.remove('n1'))
    expect(puts[0]!.signal.aborted).toBe(true)
    expect(api.deleteFile).toHaveBeenCalledWith('p1', 'n1', expect.any(AbortSignal))
    expect(result.current.items).toEqual([])
    expect(result.current.announcement).toBe('salon.jpg removed')
    expect(result.current.error).toBeNull()
  })

  it('puts the item back with a message when the delete fails', async () => {
    api.deleteFile.mockRejectedValue(new ApiRequestError(500, 'internal_error', 'x'))
    const { result } = await setup([serverFile('a'), serverFile('b')])
    await act(async () => result.current.remove('a'))
    expect(result.current.items.map((i) => i.id)).toEqual(['a', 'b'])
    expect(result.current.error).toBe('Something went wrong. Try again.')
  })

  it('treats an already deleted file as removed', async () => {
    api.deleteFile.mockRejectedValue(new ApiRequestError(404, 'not_found', 'x'))
    const { result } = await setup([serverFile('a')])
    await act(async () => result.current.remove('a'))
    expect(result.current.items).toEqual([])
    expect(result.current.error).toBeNull()
  })
})

const expire = () => new PutUploadError('http_error', 'x', 403)

/** Makes the next registerFiles wait until the returned function is called. */
function holdNextRegister() {
  const original = api.registerFiles.getMockImplementation()!
  const gate: { release?: () => void } = {}
  api.registerFiles.mockImplementationOnce(async (...args: unknown[]) => {
    await new Promise<void>((resolve) => (gate.release = resolve))
    return original(...args)
  })
  return async () => {
    await waitFor(() => expect(gate.release).toBeDefined())
    await act(async () => gate.release!())
  }
}

describe('useUploader re-registering after an expired URL', () => {
  async function failedWithExpiredUrl() {
    const hook = await setup()
    await act(async () => {
      void hook.result.current.add('photo', [photo('a.jpg')])
    })
    await act(async () => puts[0]!.reject(expire()))
    return hook
  }

  it('does not upload a file removed while it is registered again', async () => {
    const { result } = await failedWithExpiredUrl()
    await act(async () => {
      void result.current.retry('n1')
    })
    const release = holdNextRegister()
    await act(async () => puts[1]!.reject(expire()))
    await act(async () => {
      result.current.remove('n1')
    })
    await release()
    expect(api.putUpload).toHaveBeenCalledTimes(2)
    expect(api.deleteFile).toHaveBeenCalledWith('p1', 'n2')
    expect(result.current.items).toEqual([])
  })

  it('goes straight to register on the next retry when register failed after the delete', async () => {
    const { result } = await failedWithExpiredUrl()
    api.registerFiles.mockRejectedValueOnce(new ApiRequestError(500, 'internal_error', 'x'))
    await act(async () => {
      void result.current.retry('n1')
    })
    await act(async () => puts[1]!.reject(expire()))
    expect(result.current.items[0]).toMatchObject({ id: 'n1', status: 'failed' })
    await act(async () => {
      void result.current.retry('n1')
    })
    await waitFor(() => expect(api.putUpload).toHaveBeenCalledTimes(3))
    expect(api.putUpload.mock.calls[2]![0]).toBe('https://s/2')
    expect(api.deleteFile).toHaveBeenCalledTimes(1)
    expect(result.current.items[0]?.id).toBe('n2')
  })

  it('treats a 404 on the delete as done and registers again', async () => {
    const { result } = await failedWithExpiredUrl()
    api.deleteFile.mockRejectedValueOnce(new ApiRequestError(404, 'not_found', 'x'))
    await act(async () => {
      void result.current.retry('n1')
    })
    await act(async () => puts[1]!.reject(expire()))
    await waitFor(() => expect(result.current.items[0]?.id).toBe('n2'))
  })
})

describe('useUploader races and announcements', () => {
  it('counts files being registered against the slots', async () => {
    const { result } = await setup(Array.from({ length: 8 }, (_, i) => serverFile(`s${i}`)))
    const release = holdNextRegister()
    await act(async () => {
      void result.current.add('photo', [photo('a.jpg'), photo('b.jpg')])
    })
    expect(result.current.slots.photo).toBe(0)
    await release()
    expect(result.current.items).toHaveLength(10)
    expect(result.current.slots.photo).toBe(0)
  })

  it('frees the slots again when the register fails', async () => {
    api.registerFiles.mockRejectedValueOnce(new ApiRequestError(409, 'project_not_editable', 'x'))
    const { result } = await setup()
    await act(async () => result.current.add('photo', [photo('a.jpg')]))
    expect(result.current.slots.photo).toBe(10)
  })

  it('ignores a register that answers after the project changed', async () => {
    api.listFiles.mockResolvedValue({ files: [] })
    const hook = renderHook(({ id }) => useUploader(id), { initialProps: { id: 'p1' } })
    await waitFor(() => expect(hook.result.current.phase).toBe('ready'))
    const release = holdNextRegister()
    await act(async () => {
      void hook.result.current.add('photo', [photo('a.jpg')])
    })
    hook.rerender({ id: 'p2' })
    await waitFor(() => expect(hook.result.current.phase).toBe('ready'))
    await release()
    expect(hook.result.current.items).toEqual([])
    expect(api.putUpload).not.toHaveBeenCalled()
  })

  it('puts an in-flight upload back as failed, and retryable, when its delete fails', async () => {
    api.deleteFile.mockRejectedValue(new ApiRequestError(500, 'internal_error', 'x'))
    const { result } = await setup()
    await act(async () => {
      void result.current.add('photo', [photo('a.jpg')])
    })
    await act(async () => {
      result.current.remove('n1')
    })
    expect(result.current.items[0]).toMatchObject({ id: 'n1', status: 'failed' })
    await act(async () => {
      void result.current.retry('n1')
    })
    expect(api.putUpload).toHaveBeenCalledTimes(2)
    expect(api.putUpload.mock.calls[1]![0]).toBe('https://s/1')
    await act(async () => puts[1]!.resolve())
    expect(result.current.items[0]?.status).toBe('pending')
  })

  it('says how many files failed once, when several fail in one drop', async () => {
    api.putUpload.mockRejectedValue(new PutUploadError('network_error', 'x'))
    const { result } = await setup()
    await act(async () =>
      result.current.add('photo', [photo('a.jpg'), photo('b.jpg'), photo('c.jpg')]),
    )
    expect(result.current.announcement.trim()).toBe('3 files failed to upload.')
  })

  it('warns before leaving the page while something uploads', async () => {
    const { result } = await setup()
    const leave = () => {
      const event = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(event)
      return event.defaultPrevented
    }
    expect(leave()).toBe(false)
    await act(async () => {
      void result.current.add('photo', [photo('a.jpg')])
    })
    expect(leave()).toBe(true)
    await act(async () => puts[0]!.resolve())
    expect(leave()).toBe(false)
  })
})

describe('useUploader unmount', () => {
  it('aborts uploads and updates nothing afterwards', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { result, unmount } = await setup()
    await act(async () => {
      void result.current.add('photo', [photo('a.jpg')])
    })
    unmount()
    expect(puts[0]!.signal.aborted).toBe(true)
    await act(async () => puts[0]!.progress(1))
    expect(errors).not.toHaveBeenCalled()
    errors.mockRestore()
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PutUploadError, putUpload } from './put-upload'

class FakeXhr {
  static last: FakeXhr | undefined
  upload: {
    onprogress?: (e: { lengthComputable: boolean; loaded: number; total: number }) => void
  } = {}
  headers: Record<string, string> = {}
  status = 0
  timeout = 0
  method = ''
  url = ''
  body: unknown
  aborted = false
  done = false
  static created = 0
  onload?: () => void
  onerror?: () => void
  ontimeout?: () => void
  onabort?: () => void
  constructor() {
    FakeXhr.last = this
    FakeXhr.created++
  }
  open(method: string, url: string) {
    this.method = method
    this.url = url
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value
  }
  send(body: unknown) {
    this.body = body
  }
  abort() {
    if (this.done) return
    this.aborted = true
    this.onabort?.()
  }
}

const file = new File(['abc'], 'a.jpg', { type: 'image/jpeg' })
const URL_OK = 'https://storage.example.test/upload?token=abc'
const xhr = () => FakeXhr.last!

describe('putUpload', () => {
  beforeEach(() => {
    FakeXhr.last = undefined
    FakeXhr.created = 0
    vi.stubGlobal('XMLHttpRequest', FakeXhr)
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('PUTs the file with the given headers and nothing else', async () => {
    const done = putUpload(URL_OK, { 'Content-Type': 'image/jpeg' }, file)
    xhr().status = 200
    xhr().onload?.()
    xhr().done = true
    await expect(done).resolves.toBeUndefined()
    expect(xhr().method).toBe('PUT')
    expect(xhr().url).toBe(URL_OK)
    expect(xhr().body).toBe(file)
    expect(xhr().headers).toEqual({ 'Content-Type': 'image/jpeg' })
  })

  it('reports progress as a fraction', async () => {
    const onProgress = vi.fn()
    const done = putUpload(URL_OK, {}, file, { onProgress })
    xhr().upload.onprogress?.({ lengthComputable: true, loaded: 1, total: 4 })
    xhr().upload.onprogress?.({ lengthComputable: false, loaded: 1, total: 0 })
    xhr().status = 204
    xhr().onload?.()
    await done
    expect(onProgress.mock.calls).toEqual([[0.25]])
  })

  it('rejects with the status on a non-2xx answer', async () => {
    const done = putUpload(URL_OK, {}, file)
    xhr().status = 403
    xhr().onload?.()
    await expect(done).rejects.toMatchObject({
      name: 'PutUploadError',
      code: 'http_error',
      status: 403,
    })
  })

  it('rejects with a typed error on network failure', async () => {
    const done = putUpload(URL_OK, {}, file)
    xhr().onerror?.()
    await expect(done).rejects.toBeInstanceOf(PutUploadError)
    await expect(done).rejects.toMatchObject({ code: 'network_error', status: 0 })
  })

  it('rejects with a typed error on timeout', async () => {
    const done = putUpload(URL_OK, {}, file)
    xhr().ontimeout?.()
    await expect(done).rejects.toMatchObject({ code: 'timeout' })
  })

  it('aborts the request with an AbortError when the signal fires', async () => {
    const controller = new AbortController()
    const done = putUpload(URL_OK, {}, file, { signal: controller.signal })
    controller.abort()
    await expect(done).rejects.toMatchObject({ name: 'AbortError' })
    expect(xhr().aborted).toBe(true)
  })

  it('rejects at once when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(putUpload(URL_OK, {}, file, { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(FakeXhr.created).toBe(0)
  })

  it('does not abort the request when the signal fires after success', async () => {
    const controller = new AbortController()
    const done = putUpload(URL_OK, {}, file, { signal: controller.signal })
    xhr().status = 200
    xhr().onload?.()
    xhr().done = true
    await done
    controller.abort()
    expect(xhr().aborted).toBe(false)
  })

  it.each(['http://localhost:55421/a', 'http://127.0.0.1:55421/a', 'http://[::1]:55421/a'])(
    'allows plain http for the local stack at %s',
    async (url) => {
      const done = putUpload(url, {}, file)
      xhr().status = 200
      xhr().onload?.()
      await expect(done).resolves.toBeUndefined()
    },
  )

  it('rejects with invalid_url when open throws', async () => {
    vi.spyOn(FakeXhr.prototype, 'open').mockImplementationOnce(() => {
      throw new DOMException('bad', 'SyntaxError')
    })
    await expect(putUpload(URL_OK, {}, file)).rejects.toMatchObject({ code: 'invalid_url' })
  })

  it('rejects with network_error when a header is refused', async () => {
    vi.spyOn(FakeXhr.prototype, 'setRequestHeader').mockImplementationOnce(() => {
      throw new DOMException('bad', 'SyntaxError')
    })
    await expect(putUpload(URL_OK, { 'X-Bad': 'v' }, file)).rejects.toMatchObject({
      code: 'network_error',
    })
  })

  it.each([
    'javascript:alert(1)',
    'data:text/plain,x',
    'not a url',
    'ftp://x.test/a',
    'http://storage.example.test/a',
    'https://user:pass@storage.example.test/a',
  ])('refuses to PUT to %s', async (url) => {
    await expect(putUpload(url, {}, file)).rejects.toMatchObject({ code: 'invalid_url' })
    expect(FakeXhr.created).toBe(0)
  })
})

const TIMEOUT_MS = 10 * 60_000

type PutUploadCode = 'invalid_url' | 'network_error' | 'timeout' | 'http_error'

/** A failed PUT to the signed URL. `status` is 0 when no answer came back. */
export class PutUploadError extends Error {
  constructor(
    readonly code: PutUploadCode,
    message: string,
    readonly status = 0,
  ) {
    super(message)
    this.name = 'PutUploadError'
  }
}

type Options = { onProgress?: (fraction: number) => void; signal?: AbortSignal }

const abortError = () => new DOMException('The upload was cancelled.', 'AbortError')

/**
 * PUTs the file to a signed storage URL. XHR because fetch has no upload progress. No auth header:
 * the token is inside the URL. Cancelling rejects with an AbortError, like apiFetch.
 */
export function putUpload(
  url: string,
  headers: Record<string, string>,
  file: File,
  { onProgress, signal }: Options = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    let parsed: URL | undefined
    try {
      parsed = new URL(url)
    } catch {
      // handled below
    }
    if (parsed?.protocol !== 'https:' && parsed?.protocol !== 'http:') {
      return reject(new PutUploadError('invalid_url', 'The upload address is not valid.'))
    }
    if (signal?.aborted) return reject(abortError())

    const request = new XMLHttpRequest()
    const onAbort = () => request.abort()
    const finish = (settle: () => void) => {
      signal?.removeEventListener('abort', onAbort)
      settle()
    }
    request.open('PUT', parsed.href)
    request.timeout = TIMEOUT_MS
    for (const [name, value] of Object.entries(headers)) request.setRequestHeader(name, value)
    request.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress?.(event.loaded / event.total)
    }
    request.onload = () =>
      finish(() =>
        request.status >= 200 && request.status < 300
          ? resolve()
          : reject(new PutUploadError('http_error', 'The upload was rejected.', request.status)),
      )
    request.onerror = () =>
      finish(() => reject(new PutUploadError('network_error', 'Could not reach the server.')))
    request.ontimeout = () =>
      finish(() => reject(new PutUploadError('timeout', 'The upload took too long.')))
    request.onabort = () => finish(() => reject(abortError()))
    signal?.addEventListener('abort', onAbort, { once: true })
    request.send(file)
  })
}

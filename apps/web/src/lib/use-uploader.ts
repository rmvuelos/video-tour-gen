import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { ApiRequestError } from './api'
import { PutUploadError, putUpload } from './put-upload'
import { canSubmit, errorCodeMessage, remainingSlots, type FileKind } from './upload-rules'
import { initialState, uploaderReducer, type UploaderItem } from './uploader-reducer'
import { deleteFile, listFiles, registerFiles, type UploadTarget } from './uploads'

const MAX_PARALLEL = 3
// The signed URL lives 2 h; storage answers 400/403 once it has expired.
const EXPIRED_URL = new Set([400, 403])
const KINDS: FileKind[] = ['plan', 'photo']

const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError'

const PUT_MESSAGES = {
  invalid_url: 'The upload address is not valid. Remove the file and add it again.',
  network_error: 'Could not reach the server. Check your connection and retry.',
  timeout: 'The upload took too long. Try again.',
  http_error: 'The upload was rejected. Try again.',
}

function messageFor(e: unknown): string {
  if (e instanceof PutUploadError) return PUT_MESSAGES[e.code]
  if (!(e instanceof ApiRequestError)) return errorCodeMessage(null)
  if (e.status === 429) return 'Too many requests. Wait a moment and try again.'
  if (!e.details?.length) return errorCodeMessage(e.code)
  const named = e.details.map((d) =>
    errorCodeMessage(d.code, typeof d.filename === 'string' ? d.filename : undefined),
  )
  return [...new Set(named)].join(' ')
}

/** Runs at most `limit` tasks at once; the rest wait in order. */
function createQueue(limit: number) {
  const waiting: (() => void)[] = []
  let running = 0
  const next = () => {
    while (running < limit && waiting.length) waiting.shift()!()
  }
  return (task: () => Promise<boolean>) =>
    new Promise<boolean>((resolve) => {
      waiting.push(() => {
        running++
        void task()
          .catch(() => false)
          .then((ok) => {
            running--
            resolve(ok)
            next()
          })
      })
      next()
    })
}

type Outcome = { kind: 'done' | 'aborted' } | { kind: 'failed' | 'expired'; message: string }

type Local = { ctl: AbortController; file: File; kind: FileKind; target: UploadTarget }

/**
 * State of the uploader screen: the project's files plus browser uploads in flight.
 * Retry choice: the backend cannot re-sign an existing row, so when the stored URL was refused
 * with 400/403 (expired) the row is deleted and registered again, once; any other failure re-PUTs
 * the same URL.
 */
export function useUploader(projectId: string) {
  const [state, dispatch] = useReducer(uploaderReducer, initialState)
  const [reloadKey, setReloadKey] = useState(0)
  const scopeRef = useRef(new AbortController())
  const locals = useRef(new Map<string, Local>())
  const itemsRef = useRef(state.items)
  const [schedule] = useState(() => createQueue(MAX_PARALLEL))

  useEffect(() => {
    itemsRef.current = state.items
  })

  useEffect(() => {
    const scope = new AbortController()
    scopeRef.current = scope
    const pending = locals.current
    dispatch({ type: 'loading' })
    listFiles(projectId, scope.signal).then(
      ({ files }) =>
        dispatch({
          type: 'loaded',
          items: files.map(({ error_code, ...f }) => ({
            id: f.id,
            kind: f.kind,
            filename: f.filename,
            size: f.size,
            mime: f.mime,
            status: f.status,
            ...(f.status === 'invalid' && { error: errorCodeMessage(error_code, f.filename) }),
          })),
        }),
      (e: unknown) => {
        if (!isAbort(e)) dispatch({ type: 'loadFailed', error: messageFor(e) })
      },
    )
    return () => {
      scope.abort()
      pending.forEach((l) => l.ctl.abort())
      pending.clear()
    }
  }, [projectId, reloadKey])

  /** Dispatches unless the project changed or the screen unmounted. */
  const send = useCallback((action: Parameters<typeof dispatch>[0]) => {
    if (!scopeRef.current.signal.aborted) dispatch(action)
  }, [])

  /** One PUT of a stored local file. */
  const putOnce = useCallback(
    async (id: string): Promise<Outcome> => {
      const local = locals.current.get(id)
      if (!local || local.ctl.signal.aborted) return { kind: 'aborted' }
      const { ctl, file, target } = local
      try {
        await putUpload(target.upload_url, target.headers, file, {
          signal: ctl.signal,
          onProgress: (progress) => send({ type: 'progress', id, progress }),
        })
        locals.current.delete(id)
        send({ type: 'done', id })
        return { kind: 'done' }
      } catch (e) {
        if (isAbort(e)) return { kind: 'aborted' }
        const expired = e instanceof PutUploadError && EXPIRED_URL.has(e.status)
        return { kind: expired ? 'expired' : 'failed', message: messageFor(e) }
      }
    },
    [send],
  )

  /** Deletes the row and registers the file again. Returns the new id, or undefined on failure. */
  const reregister = useCallback(
    async (id: string): Promise<string | undefined> => {
      const local = locals.current.get(id)
      if (!local) return undefined
      const { file, kind } = local
      try {
        const { signal } = scopeRef.current
        await deleteFile(projectId, id, signal)
        const { files } = await registerFiles(
          projectId,
          [{ kind, filename: file.name, size: file.size, mime: file.type }],
          signal,
        )
        const fresh = files[0]!
        locals.current.delete(id)
        locals.current.set(fresh.file_id, { ctl: new AbortController(), file, kind, target: fresh })
        send({ type: 'replaceId', oldId: id, id: fresh.file_id })
        return fresh.file_id
      } catch (e) {
        if (!isAbort(e)) send({ type: 'failed', id, error: messageFor(e) })
        return undefined
      }
    },
    [projectId, send],
  )

  const upload = useCallback(
    async (firstId: string, canReregister: boolean): Promise<boolean> => {
      let id = firstId
      let outcome = await putOnce(id)
      if (outcome.kind === 'expired' && canReregister) {
        const fresh = await reregister(id)
        if (!fresh) return false
        id = fresh
        outcome = await putOnce(id)
      }
      if (outcome.kind === 'failed' || outcome.kind === 'expired') {
        send({ type: 'failed', id, error: outcome.message })
      }
      return outcome.kind === 'done'
    },
    [putOnce, reregister, send],
  )

  const add = useCallback(
    async (kind: FileKind, files: File[]) => {
      if (files.length === 0) return
      const { signal } = scopeRef.current
      send({ type: 'error', error: null })
      let targets: UploadTarget[]
      try {
        ;({ files: targets } = await registerFiles(
          projectId,
          files.map((f) => ({ kind, filename: f.name, size: f.size, mime: f.type })),
          signal,
        ))
      } catch (e) {
        if (!isAbort(e)) send({ type: 'error', error: messageFor(e) })
        return
      }
      const items: UploaderItem[] = targets.map((target, i) => {
        const file = files[i]!
        locals.current.set(target.file_id, { ctl: new AbortController(), file, kind, target })
        return {
          id: target.file_id,
          kind,
          filename: file.name,
          size: file.size,
          mime: file.type,
          status: 'uploading',
          progress: 0,
          file,
        }
      })
      send({ type: 'added', items })
      const results = await Promise.all(items.map((i) => schedule(() => upload(i.id, false))))
      const done = results.filter(Boolean).length
      if (done > 0 && done === items.length) {
        const noun = kind === 'photo' ? `photo${done === 1 ? '' : 's'}` : 'plan'
        send({ type: 'announce', text: `${done} ${noun} uploaded` })
      }
    },
    [projectId, schedule, send, upload],
  )

  const retry = useCallback(
    async (id: string) => {
      if (!locals.current.has(id)) return
      send({ type: 'uploading', id })
      await schedule(() => upload(id, true))
    },
    [schedule, send, upload],
  )

  const remove = useCallback(
    async (id: string) => {
      const index = itemsRef.current.findIndex((i) => i.id === id)
      const item = itemsRef.current[index]
      if (!item) return
      locals.current.get(id)?.ctl.abort()
      locals.current.delete(id)
      send({ type: 'removed', id })
      try {
        await deleteFile(projectId, id, scopeRef.current.signal)
      } catch (e) {
        if (isAbort(e) || (e instanceof ApiRequestError && e.status === 404)) return
        send({ type: 'restore', item, index, error: messageFor(e) })
      }
    },
    [projectId, send],
  )

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  const counts = Object.fromEntries(
    KINDS.map((k) => [k, state.items.filter((i) => i.kind === k).length]),
  ) as Record<FileKind, number>
  const slots = Object.fromEntries(KINDS.map((k) => [k, remainingSlots(k, counts[k])])) as Record<
    FileKind,
    number
  >

  return {
    phase: state.phase,
    loadError: state.loadError,
    error: state.error,
    items: state.items,
    announcement: state.announcement,
    counts,
    slots,
    submit: canSubmit(state.items),
    reload,
    add,
    retry,
    remove,
  }
}

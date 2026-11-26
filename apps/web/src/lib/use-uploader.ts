import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { ApiRequestError } from './api'
import { PutUploadError, putUpload } from './put-upload'
import { canSubmit, errorCodeMessage, remainingSlots, type FileKind } from './upload-rules'
import {
  initialState,
  uploaderReducer,
  type UploaderAction,
  type UploaderItem,
} from './uploader-reducer'
import { deleteFile, listFiles, registerFiles, type UploadTarget } from './uploads'

const MAX_PARALLEL = 3
// The signed URL lives 2 h; storage answers 400/403 once it has expired.
const EXPIRED_URL = new Set([400, 403])
const KINDS: FileKind[] = ['plan', 'photo']

const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError'
const isNotFound = (e: unknown) => e instanceof ApiRequestError && e.status === 404

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
  return <T>(task: () => Promise<T>, fallback: T) =>
    new Promise<T>((resolve) => {
      waiting.push(() => {
        running++
        void task()
          .catch(() => fallback)
          .then((result) => {
            running--
            resolve(result)
            next()
          })
      })
      next()
    })
}

type Send = (action: UploaderAction) => void
type PutResult = { kind: 'done' | 'aborted' } | { kind: 'failed' | 'expired'; message: string }
type Result = 'done' | 'failed' | 'aborted'

/** `target` is null once the row was deleted and the file still has to be registered again. */
type Local = { ctl: AbortController; file: File; kind: FileKind; target: UploadTarget | null }

/**
 * State of the uploader screen: the project's files plus browser uploads in flight.
 * Retry choice: the backend cannot re-sign an existing row, so when the stored URL was refused
 * with 400/403 (expired) the row is deleted and registered again, once; any other failure re-PUTs
 * the same URL. If that register fails, the next Retry goes straight to register.
 */
export function useUploader(projectId: string) {
  const [state, dispatch] = useReducer(uploaderReducer, initialState)
  const [reloadKey, setReloadKey] = useState(0)
  const scopeRef = useRef<AbortController | null>(null)
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
            // The card already shows the file name, so the message does not repeat it.
            ...(f.status === 'invalid' && { error: errorCodeMessage(error_code) }),
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

  const uploading = state.items.some((i) => i.status === 'uploading')
  useEffect(() => {
    if (!uploading) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [uploading])

  /** The scope of the current project and a dispatch that stops once that scope is aborted. */
  const startOperation = useCallback((): { scope: AbortController; send: Send } => {
    const scope = (scopeRef.current ??= new AbortController())
    return {
      scope,
      send: (action) => {
        if (!scope.signal.aborted) dispatch(action)
      },
    }
  }, [])

  /** One PUT of a stored local file. */
  const putOnce = useCallback(async (id: string, send: Send): Promise<PutResult> => {
    const local = locals.current.get(id)
    if (!local || local.ctl.signal.aborted) return { kind: 'aborted' }
    const { ctl, file, target } = local
    if (!target) return { kind: 'expired', message: errorCodeMessage(null) }
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
  }, [])

  /** Deletes the row (if still there) and registers the file again. Returns the new id. */
  const reregister = useCallback(
    async (id: string, scope: AbortController, send: Send): Promise<string | undefined> => {
      let local = locals.current.get(id)
      if (!local) return undefined
      const { file, kind } = local
      try {
        if (local.target) {
          await deleteFile(projectId, id, scope.signal).catch((e: unknown) => {
            if (!isNotFound(e)) throw e
          })
          local = { ...local, target: null }
          locals.current.set(id, local)
        }
        const { files } = await registerFiles(
          projectId,
          [{ kind, filename: file.name, size: file.size, mime: file.type }],
          scope.signal,
        )
        const fresh = files[0]!
        if (locals.current.get(id) !== local || local.ctl.signal.aborted) {
          // Removed (or the screen left) while registering: do not keep the new row.
          deleteFile(projectId, fresh.file_id).catch(() => undefined)
          return undefined
        }
        locals.current.delete(id)
        locals.current.set(fresh.file_id, { ctl: new AbortController(), file, kind, target: fresh })
        send({ type: 'replaceId', oldId: id, id: fresh.file_id })
        return fresh.file_id
      } catch (e) {
        if (!isAbort(e)) send({ type: 'failed', id, error: messageFor(e) })
        return undefined
      }
    },
    [projectId],
  )

  const upload = useCallback(
    async (
      firstId: string,
      canReregister: boolean,
      scope: AbortController,
      send: Send,
    ): Promise<Result> => {
      let id = firstId
      let outcome = await putOnce(id, send)
      if (outcome.kind === 'expired' && canReregister) {
        const fresh = await reregister(id, scope, send)
        if (!fresh) return 'failed'
        id = fresh
        outcome = await putOnce(id, send)
      }
      if (outcome.kind === 'failed' || outcome.kind === 'expired') {
        send({ type: 'failed', id, error: outcome.message })
        return 'failed'
      }
      return outcome.kind
    },
    [putOnce, reregister],
  )

  /** Registers a whole drop in one request; returns the new items (none on error). */
  const registerDrop = useCallback(
    async (kind: FileKind, files: File[], scope: AbortController, send: Send) => {
      const count = files.length
      send({ type: 'error', error: null })
      send({ type: 'registering', kind, count })
      try {
        const request = files.map((f) => ({ kind, filename: f.name, size: f.size, mime: f.type }))
        const { files: targets } = await registerFiles(projectId, request, scope.signal)
        if (scope.signal.aborted) {
          // The project changed meanwhile: free the rows instead of uploading into them.
          targets.forEach((t) => deleteFile(projectId, t.file_id).catch(() => undefined))
          return []
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
        return items
      } catch (e) {
        if (!isAbort(e)) send({ type: 'error', error: messageFor(e) })
        return []
      } finally {
        send({ type: 'registerEnded', kind, count })
      }
    },
    [projectId],
  )

  const add = useCallback(
    async (kind: FileKind, files: File[]) => {
      if (files.length === 0) return
      const { scope, send } = startOperation()
      const items = await registerDrop(kind, files, scope, send)
      const results = await Promise.all(
        items.map((i) => schedule(() => upload(i.id, false, scope, send), 'failed' as Result)),
      )
      const done = results.filter((r) => r === 'done').length
      const failed = results.filter((r) => r === 'failed').length
      if (items.length > 0 && done === items.length) {
        const noun = kind === 'photo' ? `photo${done === 1 ? '' : 's'}` : 'plan'
        send({ type: 'announce', text: `${done} ${noun} uploaded` })
      } else if (failed > 1) {
        send({ type: 'announce', text: `${failed} files failed to upload.` })
      }
    },
    [registerDrop, schedule, startOperation, upload],
  )

  const retry = useCallback(
    async (id: string) => {
      if (!locals.current.has(id)) return
      const { scope, send } = startOperation()
      send({ type: 'uploading', id })
      await schedule(() => upload(id, true, scope, send), 'failed' as Result)
    },
    [schedule, startOperation, upload],
  )

  /** Drops the item at once; the delete runs after. Returns false if there is no such item. */
  const remove = useCallback(
    (id: string): boolean => {
      const index = itemsRef.current.findIndex((i) => i.id === id)
      const item = itemsRef.current[index]
      if (!item) return false
      const { scope, send } = startOperation()
      const local = locals.current.get(id)
      local?.ctl.abort()
      locals.current.delete(id)
      send({ type: 'removed', id })
      deleteFile(projectId, id, scope.signal).catch((e: unknown) => {
        if (isAbort(e) || isNotFound(e)) return
        // Rollback: an upload we stopped can be retried from its row, which still exists.
        if (local) locals.current.set(id, { ...local, ctl: new AbortController() })
        send({ type: 'restore', item, index, error: messageFor(e) })
      })
      return true
    },
    [projectId, startOperation],
  )

  /** Marks files the server refused on submit (422), each with its own message. */
  const markInvalid = useCallback(
    (errors: { id: string; error: string }[]) => dispatch({ type: 'invalidated', errors }),
    [],
  )

  const announce = useCallback((text: string) => dispatch({ type: 'announce', text }), [])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  const counts = Object.fromEntries(
    KINDS.map((k) => [k, state.items.filter((i) => i.kind === k).length]),
  ) as Record<FileKind, number>
  const slots = Object.fromEntries(
    KINDS.map((k) => [k, remainingSlots(k, counts[k] + state.registering[k])]),
  ) as Record<FileKind, number>

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
    markInvalid,
    announce,
    add,
    retry,
    remove,
  }
}

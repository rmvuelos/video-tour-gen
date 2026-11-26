import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiRequestError } from './api'
import { errorCodeMessage } from './upload-rules'
import { submitProject, type Job, type SubmitOptions } from './uploads'

type Handlers = {
  onSubmitted: (job: Job) => void
  /** Returns false when none of the files is on screen (the list is stale). */
  onFileErrors: (errors: { id: string; error: string }[]) => boolean
  /** The files on screen are out of date: read them again. */
  onStale: () => void
  /** The project was already sent: read it again. */
  onNotEditable: () => void
}

function failureText(e: ApiRequestError): string {
  if (e.status === 429) return 'Too many requests. Wait a moment and try again.'
  const general = e.details?.find((d) => typeof d.file_id !== 'string')
  return errorCodeMessage(general?.code ?? e.code)
}

/** Sends the project once at a time. Per-file 422 details go to `onFileErrors`, the rest to `error`. */
export function useSubmit(projectId: string, handlers: Handlers) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const busy = useRef(false)
  const scope = useRef<AbortController | null>(null)
  const latest = useRef(handlers)
  useEffect(() => {
    latest.current = handlers
  })
  useEffect(() => {
    const ctl = new AbortController()
    scope.current = ctl
    return () => ctl.abort()
  }, [projectId])

  function fail(e: unknown) {
    if (!(e instanceof ApiRequestError)) return setError(errorCodeMessage(null))
    const files = (e.details ?? []).flatMap((d) =>
      typeof d.file_id === 'string' ? [{ id: d.file_id, error: errorCodeMessage(d.code) }] : [],
    )
    const { onFileErrors, onStale, onNotEditable } = latest.current
    if (e.status === 422 && files.length > 0) {
      if (onFileErrors(files)) return
      setError(errorCodeMessage('invalid_files'))
      return onStale()
    }
    setError(failureText(e))
    if (e.code === 'files_changed') onStale()
    if (e.code === 'project_not_editable') onNotEditable()
  }

  const submit = useCallback(
    async (options: SubmitOptions) => {
      if (busy.current) return
      busy.current = true
      setSubmitting(true)
      setError(null)
      const signal = scope.current!.signal
      let sent = false
      try {
        const job = await submitProject(projectId, options, signal)
        sent = true // the screen is about to change: stay blocked until then
        latest.current.onSubmitted(job)
      } catch (e) {
        if (!signal.aborted) fail(e)
      } finally {
        if (!sent) busy.current = false
        if (!sent && !signal.aborted) setSubmitting(false)
      }
    },
    [projectId],
  )

  return { submit, submitting, error }
}

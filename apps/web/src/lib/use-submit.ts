import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiRequestError } from './api'
import { errorCodeMessage } from './upload-rules'
import { submitProject, type Job, type SubmitOptions } from './uploads'

type Handlers = {
  onSubmitted: (job: Job) => void
  onFileErrors: (errors: { id: string; error: string }[]) => void
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

  const submit = useCallback(
    async (options: SubmitOptions) => {
      if (busy.current) return
      busy.current = true
      setSubmitting(true)
      setError(null)
      const signal = scope.current!.signal
      try {
        latest.current.onSubmitted(await submitProject(projectId, options, signal))
        return
      } catch (e) {
        if (signal.aborted) return
        if (!(e instanceof ApiRequestError)) setError(errorCodeMessage(null))
        else {
          const files = (e.details ?? []).flatMap((d) =>
            typeof d.file_id === 'string'
              ? [{ id: d.file_id, error: errorCodeMessage(d.code) }]
              : [],
          )
          if (e.status === 422 && files.length > 0) latest.current.onFileErrors(files)
          else setError(failureText(e))
        }
      }
      busy.current = false
      setSubmitting(false)
    },
    [projectId],
  )

  return { submit, submitting, error }
}

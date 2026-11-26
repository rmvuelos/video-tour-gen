import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiRequestError } from './api'
import { errorCodeMessage } from './upload-rules'
import { getLatestJob, retryIngest, type JobState } from './uploads'

const POLL_MS = 2000
const MAX_BACKOFF_MS = 30_000

/**
 * Polls jobs/latest while the ingest runs. Stops on done/failed (calling `onSettled` once), on
 * unmount and while the tab is hidden; errors back off 4 s, 8 s... up to 30 s and clear on success.
 */
export function useIngestJob(projectId: string, onSettled: (job: JobState) => void) {
  const [job, setJob] = useState<JobState | null>(null)
  const [failures, setFailures] = useState(0)
  const [retrying, setRetrying] = useState(false)
  const [retryError, setRetryError] = useState<string | null>(null)
  // Bumped by retry to start a new polling loop.
  const [round, setRound] = useState(0)
  const scope = useRef<AbortController | null>(null)
  const settled = useRef(onSettled)
  useEffect(() => {
    settled.current = onSettled
  })

  useEffect(() => {
    const ctl = new AbortController()
    scope.current = ctl
    let timer: ReturnType<typeof setTimeout> | undefined
    let errors = 0
    let busy = false
    let finished = false
    const schedule = (ms: number) => {
      timer = setTimeout(poll, ms)
    }
    function poll() {
      timer = undefined
      if (document.hidden) return // visibilitychange restarts the loop
      busy = true
      getLatestJob(projectId, ctl.signal).then(
        (next) => {
          busy = false
          if (ctl.signal.aborted) return
          errors = 0
          setFailures(0)
          setJob(next)
          if (next.status === 'done' || next.status === 'failed') {
            finished = true
            settled.current(next)
          } else schedule(POLL_MS)
        },
        () => {
          busy = false
          if (ctl.signal.aborted) return
          errors += 1
          setFailures(errors)
          schedule(Math.min(POLL_MS * 2 ** errors, MAX_BACKOFF_MS))
        },
      )
    }
    const onVisible = () => {
      if (!finished && !document.hidden && timer === undefined && !busy) poll()
    }
    document.addEventListener('visibilitychange', onVisible)
    poll()
    return () => {
      ctl.abort()
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [projectId, round])

  const retry = useCallback(async () => {
    setRetrying(true)
    setRetryError(null)
    try {
      await retryIngest(projectId, scope.current!.signal)
      setJob(null)
      setRound((r) => r + 1)
    } catch (e) {
      if (scope.current!.signal.aborted) return
      setRetryError(
        e instanceof ApiRequestError && e.status === 429
          ? 'Too many requests. Wait a moment and try again.'
          : errorCodeMessage(e instanceof ApiRequestError ? e.code : null),
      )
    }
    setRetrying(false)
  }, [projectId])

  return { job, failures, retrying, retryError, retry }
}

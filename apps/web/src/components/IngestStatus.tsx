import { useEffect, useRef } from 'react'
import { errorCodeMessage } from '../lib/upload-rules'
import { useIngestJob } from '../lib/use-ingest-job'
import type { JobState } from '../lib/uploads'
import { Alert } from './ui/Alert'
import { ProgressBar } from './ui/ProgressBar'

// Failures in a row before the user hears about it: one blip is not worth a message.
const SHOW_FAILURES_AT = 2

const checkedCount = (job: JobState) =>
  job.files.filter((f) => f.status === 'valid' || f.status === 'invalid').length

/** Follows the ingest of a sent project until it is done or failed. */
export function IngestStatus({
  projectId,
  onSettled,
}: {
  projectId: string
  onSettled: (job: JobState) => void
}) {
  const { job, failures, fatal, retrying, retryError, retry } = useIngestJob(projectId, onSettled)
  const heading = useRef<HTMLHeadingElement>(null)
  const live = useRef<HTMLParagraphElement>(null)
  const failed = job?.status === 'failed'
  const total = job?.files.length ?? 0
  const done = job ? checkedCount(job) : 0
  const determinate = job?.status === 'running' && total > 0

  // What the shared live region says: one text per state. Failed is left to the alert.
  let text = 'Checking your files…'
  if (retrying) text = 'Retrying…'
  else if (fatal) text = "We can't find this job any more. Reload the page."
  else if (failures >= SHOW_FAILURES_AT) text = "Can't check the progress right now. Trying again…"
  else if (!job || job.status === 'queued') text = 'Waiting to start…'
  else if (job.status === 'done') text = 'Finishing up…'
  const spoken = failed && !retrying ? '' : text

  // The region is written after it is mounted: text present at mount is not announced.
  useEffect(() => {
    if (live.current) live.current.textContent = spoken
  }, [spoken])

  // The view just changed (or a retry took the alert away): put the focus on the new content.
  const wasFailed = useRef(false)
  useEffect(() => {
    if (wasFailed.current && !failed) heading.current?.focus()
    wasFailed.current = failed
  }, [failed])
  useEffect(() => heading.current?.focus(), [])

  return (
    <div className="flex flex-col gap-4">
      <h2 ref={heading} tabIndex={-1} className="text-title-sm font-semibold outline-none">
        Checking your files
      </h2>
      <p ref={live} role="status" className="sr-only" />
      {failed ? (
        <Alert
          tone="error"
          action={{ label: 'Try again', busy: retrying, onClick: () => void retry() }}
        >
          {errorCodeMessage(job.error_code)}
        </Alert>
      ) : (
        <>
          <p aria-hidden="true" className="text-body text-fg-muted">
            {text}
          </p>
          <ProgressBar
            label="Checking your files"
            aria-valuetext={determinate ? `${done} of ${total} files checked` : 'Waiting to start'}
            {...(determinate && { value: Math.round((done / total) * 100) })}
          />
        </>
      )}
      {retryError && <Alert tone="error">{retryError}</Alert>}
      {determinate && (
        <p className="text-body text-fg-muted">
          {done} of {total} files checked
        </p>
      )}
    </div>
  )
}

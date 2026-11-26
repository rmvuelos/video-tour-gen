import { errorCodeMessage } from '../lib/upload-rules'
import { useIngestJob } from '../lib/use-ingest-job'
import type { JobState } from '../lib/uploads'
import { Alert } from './ui/Alert'
import { ProgressBar } from './ui/ProgressBar'

// Failures in a row before the user hears about it: one blip is not worth a message.
const SHOW_FAILURES_AT = 2

const checkedCount = (job: JobState) =>
  job.files.filter((f) => f.status === 'valid' || f.status === 'invalid').length

/** Text for the live region: it changes with the job state, not with every poll. */
function stateText(job: JobState | null): string {
  if (!job || job.status === 'queued') return 'Waiting to start…'
  if (job.status === 'running') return 'Checking your files…'
  return job.status === 'done' ? 'Finishing up…' : 'Checking your files failed.'
}

/** Follows the ingest of a sent project until it is done or failed. */
export function IngestStatus({
  projectId,
  onSettled,
}: {
  projectId: string
  onSettled: (job: JobState) => void
}) {
  const { job, failures, retryError, retry } = useIngestJob(projectId, onSettled)
  const failed = job?.status === 'failed'
  const total = job?.files.length ?? 0
  const done = job ? checkedCount(job) : 0
  const determinate = job?.status === 'running' && total > 0

  return (
    <div className="flex flex-col gap-4">
      <p role="status" className="sr-only">
        {stateText(job)}
      </p>
      {failed ? (
        <Alert tone="error" action={{ label: 'Try again', onClick: () => void retry() }}>
          {errorCodeMessage(job.error_code)}
        </Alert>
      ) : (
        <>
          <p aria-hidden="true" className="text-body text-fg-muted">
            {stateText(job)}
          </p>
          <ProgressBar
            label="Checking your files"
            {...(determinate && { value: (done / total) * 100 })}
          />
        </>
      )}
      {retryError && <Alert tone="error">{retryError}</Alert>}
      {determinate && (
        <p className="text-body text-fg-muted">
          {done} of {total} files checked
        </p>
      )}
      {failures >= SHOW_FAILURES_AT && (
        <p className="text-body text-fg-muted">
          Can&apos;t check the progress right now. Trying again…
        </p>
      )}
    </div>
  )
}

import type { ComponentProps } from 'react'
import file from '../../assets/icons/file.svg'
import x from '../../assets/icons/x.svg'
import { formatBytes } from '../../lib/format-bytes'
import { Alert } from './Alert'
import { Card } from './Card'
import { Icon } from './Icon'
import { ProgressBar } from './ProgressBar'

type Props = Omit<ComponentProps<typeof Card>, 'children'> & {
  file: { name: string; size: number; type: string }
  status: 'pending' | 'uploading' | 'uploaded' | 'error'
  /** Object URL of an image; without it (PDF) the card shows a file icon. */
  preview?: string
  progress?: number
  /** What failed and what to do; shown for `error`. */
  error?: string
  /** "Retry" or "Replace" for `error`. */
  action?: { label: string; onClick: () => void }
  onRemove: () => void
}

const STATUS_TEXT = { pending: 'Waiting to upload', uploaded: 'Uploaded' }

/** State is always text (and the progress bar), never only color. */
export function FileCard({
  file: f,
  status,
  preview,
  progress,
  error,
  action,
  onRemove,
  ...rest
}: Props) {
  return (
    <Card className="flex flex-col gap-3 p-4" {...rest}>
      <div className="flex items-center gap-4">
        <span className="inline-flex size-thumb shrink-0 items-center justify-center overflow-hidden rounded-control bg-tile text-fg-accent">
          {preview ? (
            <img src={preview} alt="" className="size-full object-cover" />
          ) : (
            <Icon src={file} />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p title={f.name} className="truncate text-body font-medium">
            {f.name}
          </p>
          <p className="text-caption text-fg-muted">
            {formatBytes(f.size)} ·{' '}
            {status === 'uploading'
              ? `Uploading ${progress ?? 0}%`
              : status === 'error'
                ? 'Failed'
                : STATUS_TEXT[status]}
          </p>
        </div>
        <button
          type="button"
          aria-label={`Remove ${f.name}`}
          onClick={onRemove}
          className="cursor-pointer rounded-pill p-2 text-fg"
        >
          <Icon src={x} size="sm" />
        </button>
      </div>
      {status === 'uploading' && (
        <ProgressBar label={`Uploading ${f.name}`} value={progress ?? 0} />
      )}
      {status === 'error' && (
        <Alert tone="error" {...(action && { action })}>
          {error}
        </Alert>
      )}
    </Card>
  )
}

import { useId } from 'react'
import alert from '../../assets/icons/alert.svg'
import file from '../../assets/icons/file.svg'
import x from '../../assets/icons/x.svg'
import { formatBytes } from '../../lib/format-bytes'
import { useObjectUrl } from '../../lib/use-object-url'
import { Card } from './Card'
import { Icon } from './Icon'
import { ProgressBar } from './ProgressBar'

type State =
  | { status: 'pending' | 'uploaded' }
  | { status: 'uploading'; progress?: number }
  /** `action` is "Retry" or "Replace"; its accessible name gets the file name. */
  | { status: 'error'; error: string; action?: { label: string; onClick: () => void } }

type Props = {
  file: { name: string; size: number; type: string }
  /**
   * Thumbnail URL. The caller owns it and revokes it. With a `File` and no `preview`, the card
   * creates its own object URL (images only) and revokes it.
   */
  preview?: string
  onRemove: () => void
  className?: string
} & State

const STATUS_TEXT = { pending: 'Waiting to upload', uploaded: 'Uploaded', error: 'Failed' }

/** State is always text (and the progress bar), never only color. */
export function FileCard({ file: f, preview, onRemove, className = '', ...state }: Props) {
  const own = useObjectUrl(!preview && f instanceof File && f.type.startsWith('image/') ? f : null)
  const src = preview ?? own
  const messageId = useId()
  const percent =
    state.status === 'uploading' ? Math.round(Math.min(100, Math.max(0, state.progress ?? 0))) : 0
  return (
    <Card className={`flex flex-col gap-3 p-4 ${className}`}>
      <div className="flex items-center gap-4">
        <span className="inline-flex size-thumb shrink-0 items-center justify-center overflow-hidden rounded-control bg-tile text-fg-accent">
          {src ? <img src={src} alt="" className="size-full object-cover" /> : <Icon src={file} />}
        </span>
        <div className="min-w-0 flex-1">
          <p title={f.name} className="truncate text-body font-medium">
            {f.name}
          </p>
          <p className="text-caption text-fg-muted">
            {formatBytes(f.size)} <span aria-hidden="true">·</span>{' '}
            {state.status === 'uploading' ? `Uploading ${percent}%` : STATUS_TEXT[state.status]}
          </p>
        </div>
        <button
          type="button"
          aria-label={`Remove ${f.name}`}
          aria-describedby={state.status === 'error' ? messageId : undefined}
          onClick={onRemove}
          className="cursor-pointer rounded-pill p-2 text-fg"
        >
          <Icon src={x} size="sm" />
        </button>
      </div>
      {state.status === 'uploading' && (
        <ProgressBar label={`Uploading ${f.name}`} value={percent} />
      )}
      {state.status === 'error' && (
        <div
          tabIndex={-1}
          data-file-error=""
          className="flex items-start gap-3 rounded-panel border border-danger bg-surface-subtle p-4 text-body outline-none"
        >
          <Icon src={alert} className="text-danger" />
          <p id={messageId} className="flex-1">
            <span className="sr-only">{f.name}:</span> {state.error}
          </p>
          {state.action && (
            <button
              type="button"
              aria-label={`${state.action.label} ${f.name}`}
              aria-describedby={messageId}
              onClick={state.action.onClick}
              className="min-h-6 cursor-pointer px-2 text-label font-medium underline"
            >
              {state.action.label}
            </button>
          )}
        </div>
      )}
    </Card>
  )
}

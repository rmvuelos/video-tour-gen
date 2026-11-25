import type { ComponentProps } from 'react'

const STATUS = {
  saved: { text: 'All changes saved', dot: 'bg-success' },
  saving: { text: 'Saving changes', dot: 'bg-accent' },
  error: { text: 'Could not save changes', dot: 'bg-danger' },
}

type Props = Omit<ComponentProps<'div'>, 'children'> & { status: keyof typeof STATUS }

/**
 * Two live nodes stay mounted so screen readers announce changes: `status` (polite) for saved and
 * `alert` (assertive) for errors. Saving is shown but not announced: it flips too often.
 */
export function SaveStatus({ status, className = '', ...rest }: Props) {
  const { text, dot } = STATUS[status]
  return (
    <div
      className={`flex items-center gap-status-gap text-label font-medium text-fg-muted ${className}`}
      {...rest}
    >
      <span aria-hidden="true" className={`size-status-dot rounded-pill ${dot}`} />
      <span role="status">{status === 'saved' && text}</span>
      <span role="alert">{status === 'error' && text}</span>
      {status === 'saving' && <span>{text}</span>}
    </div>
  )
}

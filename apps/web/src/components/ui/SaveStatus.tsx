import type { ComponentProps } from 'react'

const STATUS = {
  saved: { text: 'All changes saved', dot: 'bg-success' },
  saving: { text: 'Saving changes', dot: 'bg-accent' },
  error: { text: 'Could not save changes', dot: 'bg-danger' },
}

type Props = Omit<ComponentProps<'div'>, 'children'> & { status: keyof typeof STATUS }

/** The live region stays mounted so screen readers announce the text when it changes. */
export function SaveStatus({ status, className = '', ...rest }: Props) {
  const { text, dot } = STATUS[status]
  return (
    <div
      role="status"
      className={`flex items-center gap-status-gap text-label font-medium text-fg-muted ${className}`}
      {...rest}
    >
      <span aria-hidden="true" data-dot="" className={`size-status-dot rounded-pill ${dot}`} />
      {text}
    </div>
  )
}

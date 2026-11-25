import type { ComponentProps } from 'react'

// Shared with Textarea. Error is the red border plus the message of the Field (never color alone).
export const FIELD_CLASS =
  'w-full rounded-control border border-field-border bg-surface px-4 text-body text-fg placeholder:text-fg-muted aria-invalid:border-danger disabled:cursor-not-allowed disabled:opacity-(--opacity-disabled)'

export function Input({ className = '', ...rest }: ComponentProps<'input'>) {
  return <input className={`h-field ${FIELD_CLASS} ${className}`} {...rest} />
}

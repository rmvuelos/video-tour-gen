import type { ComponentProps } from 'react'

type Name = { label: string; labelledBy?: never } | { labelledBy: string; label?: never }
type Props = Omit<ComponentProps<'div'>, 'children' | 'role' | 'aria-label' | 'aria-labelledby'> &
  Name & {
    /** 0 to 100. Omit it for an indeterminate bar. */
    value?: number
  }

export function ProgressBar({ value, label, labelledBy, className = '', ...rest }: Props) {
  const now = value === undefined ? undefined : Math.min(100, Math.max(0, value))
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-labelledby={labelledBy}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={now}
      className={`h-progress w-full overflow-hidden rounded-pill bg-track forced-outline ${className}`}
      {...rest}
    >
      {/* Reduced motion: no sweep and no fake value: a full, dimmed bar. */}
      <div
        className={`h-full rounded-pill bg-action forced-colors:bg-[Highlight] transition-[width] motion-reduce:transition-none ${now === undefined ? 'w-2/5 animate-indeterminate motion-reduce:w-full motion-reduce:animate-none motion-reduce:opacity-(--opacity-disabled)' : ''}`}
        style={now === undefined ? undefined : { width: `${now}%` }}
      />
    </div>
  )
}

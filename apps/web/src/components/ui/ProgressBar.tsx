import type { ComponentProps } from 'react'

type Props = Omit<ComponentProps<'div'>, 'children' | 'role'> & {
  /** 0 to 100. Omit it for an indeterminate bar. */
  value?: number
  /** Accessible name; or point `labelledBy` at a visible element. */
  label?: string
  labelledBy?: string
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
      {/* Reduced motion: no sweep, a static partial fill. */}
      <div
        className={`h-full rounded-pill bg-action forced-colors:bg-[Highlight] transition-[width] ${now === undefined ? 'w-2/5 animate-indeterminate motion-reduce:animate-none' : ''}`}
        style={now === undefined ? undefined : { width: `${now}%` }}
      />
    </div>
  )
}

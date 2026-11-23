import type { ComponentProps } from 'react'

const VARIANTS = {
  soft: 'min-h-avatar min-w-avatar bg-avatar text-subtitle text-fg',
  solid: 'min-h-avatar-sm min-w-avatar-sm bg-action text-body text-fg-on-action',
}

type Props = Omit<ComponentProps<'span'>, 'children'> & {
  initials: string
  label?: string
  variant?: keyof typeof VARIANTS
}

/** Minimum size in rem plus padding: the circle grows with the text instead of clipping it. */
export function Avatar({ initials, label, variant = 'soft', className = '', ...rest }: Props) {
  return (
    <span
      {...(label ? { role: 'img', 'aria-label': label } : {})}
      className={`inline-flex shrink-0 items-center justify-center rounded-pill px-1 font-bold ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      <span aria-hidden={label ? true : undefined}>{initials}</span>
    </span>
  )
}

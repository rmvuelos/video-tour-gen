const VARIANTS = {
  soft: 'size-avatar bg-avatar text-subtitle text-fg',
  solid: 'size-avatar-sm bg-action text-body text-fg-on-action',
}

type Props = { initials: string; label?: string; variant?: keyof typeof VARIANTS }

export function Avatar({ initials, label, variant = 'soft' }: Props) {
  return (
    <span
      {...(label ? { role: 'img', 'aria-label': label } : {})}
      className={`inline-flex shrink-0 items-center justify-center rounded-pill font-bold ${VARIANTS[variant]}`}
    >
      <span aria-hidden={label ? true : undefined}>{initials}</span>
    </span>
  )
}

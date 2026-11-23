import type { ComponentProps } from 'react'

const TONES = { muted: 'text-fg-muted', accent: 'text-fg-accent' }

type Props = ComponentProps<'span'> & { tone?: keyof typeof TONES }

export function Eyebrow({ tone = 'muted', className = '', ...rest }: Props) {
  return (
    <span className={`text-eyebrow font-bold uppercase ${TONES[tone]} ${className}`} {...rest} />
  )
}

import type { ButtonHTMLAttributes } from 'react'
import arrow from '../../assets/icons/arrow.svg'
import { Icon } from './Icon'

type Variant = 'primary' | 'secondary' | 'cta'

const VARIANTS: Record<Variant, string> = {
  primary:
    'h-btn-pill min-w-btn-pill-w rounded-pill bg-action px-6 text-label font-medium text-fg-on-action hover:bg-action-hover',
  secondary:
    'h-btn-soft min-w-btn-soft-w rounded-pill bg-control px-6 text-label font-medium text-fg hover:bg-control-hover',
  cta: 'h-btn-cta gap-3 rounded-control bg-action pr-2.75 pl-4.5 text-body font-semibold text-fg-on-action hover:bg-action-hover',
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }

export function Button({
  variant = 'primary',
  type = 'button',
  className = '',
  children,
  ...rest
}: Props) {
  return (
    <button
      type={type}
      className={`inline-flex cursor-pointer items-center justify-center whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-(--opacity-disabled) ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {children}
      {variant === 'cta' && <Icon src={arrow} className="size-6" />}
    </button>
  )
}

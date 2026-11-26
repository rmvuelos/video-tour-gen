import type { ComponentProps } from 'react'
import arrow from '../../assets/icons/arrow.svg'
import { Icon } from './Icon'

type Variant = 'primary' | 'secondary' | 'cta'

// The transparent 2px border is invisible but forced-colors mode paints it, so the button keeps
// an outline there. It sits inside the Figma height, so paddings are 2px short of the Figma ones.
const VARIANTS: Record<Variant, string> = {
  primary:
    'h-btn-pill min-w-btn-pill-w rounded-pill bg-action px-6 text-label font-medium text-fg-on-action enabled:not-aria-disabled:hover:bg-action-hover',
  secondary:
    'h-btn-soft min-w-btn-soft-w rounded-pill bg-control px-6 text-label font-medium text-fg enabled:not-aria-disabled:hover:bg-control-hover',
  cta: 'h-btn-cta gap-btn-cta-gap rounded-control bg-action pr-btn-cta-end pl-btn-cta-start text-body font-semibold text-fg-on-action enabled:not-aria-disabled:hover:bg-action-hover',
}

type Props = ComponentProps<'button'> & { variant?: Variant }

/** `className` is for layout (margins, width), not for overriding the tokens of a variant. */
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
      className={`inline-flex cursor-pointer items-center justify-center border-2 border-transparent whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-(--opacity-disabled) aria-disabled:cursor-not-allowed aria-disabled:opacity-(--opacity-disabled) ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {children}
      {variant === 'cta' && <Icon src={arrow} />}
    </button>
  )
}

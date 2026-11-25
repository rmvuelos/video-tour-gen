import type { ComponentProps } from 'react'

const SIZES = { md: 'size-icon', sm: 'size-icon-sm', nav: 'size-icon-nav' }

type Props = Omit<ComponentProps<'span'>, 'children'> & { src: string; size?: keyof typeof SIZES }

/** Decorative monochrome icon: an SVG used as a mask so it takes `currentColor`. */
export function Icon({ src, size = 'md', className = '', style, ...rest }: Props) {
  return (
    <span
      aria-hidden="true"
      data-icon=""
      className={`inline-block ${SIZES[size]} shrink-0 bg-current ${className}`}
      style={{
        maskImage: `url("${src}")`,
        maskRepeat: 'no-repeat',
        maskPosition: 'center',
        maskSize: 'contain',
        ...style,
      }}
      {...rest}
    />
  )
}

import type { ComponentProps } from 'react'

type Props = Omit<ComponentProps<'span'>, 'children'> & { src: string }

/** Decorative monochrome icon: an SVG used as a mask so it takes `currentColor`. */
export function Icon({ src, className = '', style, ...rest }: Props) {
  return (
    <span
      aria-hidden="true"
      data-icon=""
      className={`inline-block size-icon shrink-0 bg-current ${className}`}
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

import { useEffect, useRef, type ComponentProps } from 'react'

/** The page h1. It takes focus when it mounts, so a route change is announced (WCAG 2.4.3). */
export function PageTitle({ className = '', ...rest }: Omit<ComponentProps<'h1'>, 'tabIndex'>) {
  const ref = useRef<HTMLHeadingElement>(null)
  useEffect(() => ref.current?.focus(), [])
  return <h1 ref={ref} tabIndex={-1} className={`outline-none ${className}`} {...rest} />
}

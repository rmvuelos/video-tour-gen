import type { HTMLAttributes } from 'react'

/** Surface with the Figma radius and shadow. Padding is up to the caller (it differs per card). */
export function Card({ className = '', ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`rounded-card bg-surface shadow-card ${className}`} {...rest} />
}

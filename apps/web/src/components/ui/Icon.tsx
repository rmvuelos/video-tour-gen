/** Decorative monochrome icon: an SVG used as a mask so it takes `currentColor`. */
export function Icon({ src, className = '' }: { src: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 bg-current ${className}`}
      style={{
        maskImage: `url("${src}")`,
        maskRepeat: 'no-repeat',
        maskPosition: 'center',
        maskSize: 'contain',
      }}
    />
  )
}

import type { ComponentProps } from 'react'

type Item = { label: string; href?: string }
type Props = Omit<ComponentProps<'nav'>, 'children'> & { items: Item[] }

export function Breadcrumb({ items, ...rest }: Props) {
  return (
    <nav aria-label="Breadcrumb" {...rest}>
      <ol className="flex items-center gap-2 text-label font-semibold text-fg-muted uppercase">
        {items.map(({ label, href }, i) => {
          const last = i === items.length - 1
          return (
            <li key={label} className="flex items-center gap-2">
              {href && !last ? (
                <a href={href} className="rounded-control hover:text-fg">
                  {label}
                </a>
              ) : (
                <span aria-current={last ? 'page' : undefined}>{label}</span>
              )}
              {!last && (
                <span aria-hidden="true" data-separator="">
                  /
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

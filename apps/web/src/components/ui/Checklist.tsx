import { useId, type ComponentProps } from 'react'
import check from '../../assets/icons/check.svg'
import { Eyebrow } from './Eyebrow'
import { Icon } from './Icon'

type Props = Omit<ComponentProps<'div'>, 'children' | 'title'> & {
  title: string
  items: { label: string; done: boolean }[]
}

export function Checklist({ title, items, ...rest }: Props) {
  const id = useId()
  return (
    <div {...rest}>
      <Eyebrow id={id}>{title}</Eyebrow>
      <ul aria-labelledby={id} className="mt-3 flex flex-col gap-2">
        {items.map(({ label, done }) => (
          <li key={label} className="flex items-center gap-3 text-body font-medium">
            {done ? (
              <Icon src={check} className="text-success" />
            ) : (
              <span
                aria-hidden="true"
                className="size-icon rounded-pill border-2 border-line-track"
              />
            )}
            <span>
              {label}
              <span className="sr-only">, {done ? 'done' : 'missing'}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

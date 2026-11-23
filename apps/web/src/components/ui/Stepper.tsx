import type { ComponentProps } from 'react'
import check from '../../assets/icons/check.svg'
import { Icon } from './Icon'

type Props = Omit<ComponentProps<'ol'>, 'children'> & { steps: string[]; current: number }

const STATE_TEXT = { done: 'completed', current: 'current step', pending: 'not started' }

/** State is in the text (visually hidden) as well as in the circle, so color is never the only cue. */
export function Stepper({ steps, current, className = '', ...rest }: Props) {
  return (
    <ol className={`flex items-center gap-4 ${className}`} {...rest}>
      {steps.map((label, i) => {
        const state = i < current ? 'done' : i === current ? 'current' : 'pending'
        const active = state !== 'pending'
        return (
          <li
            key={label}
            aria-current={state === 'current' ? 'step' : undefined}
            className="flex items-center gap-4"
          >
            <span
              aria-hidden="true"
              className={`inline-flex size-step items-center justify-center rounded-pill text-eyebrow font-bold ${active ? 'bg-action text-fg-on-action' : 'bg-step-idle text-fg-muted'}`}
            >
              {state === 'done' ? (
                <Icon src={check} className="size-4 text-fg-on-action" />
              ) : (
                String(i + 1).padStart(2, '0')
              )}
            </span>
            <span
              className={`text-stage ${active ? 'font-bold text-fg' : 'font-medium text-fg-muted'}`}
            >
              {label}
              <span className="sr-only">, {STATE_TEXT[state]}</span>
            </span>
            {i < steps.length - 1 && (
              <span aria-hidden="true" className="h-0.5 w-step-track bg-line-track" />
            )}
          </li>
        )
      })}
    </ol>
  )
}

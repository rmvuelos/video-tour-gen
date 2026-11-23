import type { ComponentProps } from 'react'
import check from '../../assets/icons/check.svg'
import { Icon } from './Icon'

type Props = Omit<ComponentProps<'ol'>, 'children'> & { steps: string[]; current: number }

// The current step is announced by aria-current, so it carries no text suffix.
const STATE_TEXT = { done: ', completed', current: '', pending: ', not started' }

/**
 * The Figma sizes (label 240, connector 164) are maxima: a step is as wide as its label and the
 * connector shrinks down to a minimum, so the row fits a 750px container. State is in text and in
 * the circle, so color is never the only cue.
 */
export function Stepper({ steps, current, className = '', ...rest }: Props) {
  return (
    <ol aria-label="Progress" className={`flex w-full items-center ${className}`} {...rest}>
      {steps.map((label, i) => {
        const state = i < current ? 'done' : i === current ? 'current' : 'pending'
        const active = state !== 'pending'
        return (
          <li
            key={`${i}-${label}`}
            aria-current={state === 'current' ? 'step' : undefined}
            className={`flex items-center ${i < steps.length - 1 ? 'basis-step-pitch' : ''}`}
          >
            <span
              aria-hidden="true"
              className={`inline-flex size-step shrink-0 forced-outline items-center justify-center rounded-pill text-eyebrow font-bold ${active ? 'bg-action text-fg-on-action' : 'bg-step-idle text-fg-muted'}`}
            >
              {state === 'done' ? (
                <Icon src={check} size="sm" className="text-fg-on-action" />
              ) : (
                String(i + 1).padStart(2, '0')
              )}
            </span>
            <span
              className={`ml-step-gap max-w-step-label flex-[0_1_var(--spacing-step-label)] text-stage whitespace-nowrap ${active ? 'font-bold text-fg' : 'font-medium text-fg-muted'}`}
            >
              {label}
              <span className="sr-only">{STATE_TEXT[state]}</span>
            </span>
            {i < steps.length - 1 && (
              <span
                aria-hidden="true"
                className="mr-step-track-trail ml-step-track-lead h-0.5 min-w-step-track-min max-w-step-track flex-[0_1_var(--spacing-step-track)] bg-line-track"
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}

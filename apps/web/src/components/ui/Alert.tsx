import type { ComponentProps, ReactNode } from 'react'
import alert from '../../assets/icons/alert.svg'
import check from '../../assets/icons/check.svg'
import info from '../../assets/icons/info.svg'
import { Icon } from './Icon'

const TONES = {
  info: { icon: info, color: 'text-fg-accent', border: 'border-line', label: 'Info:' },
  success: { icon: check, color: 'text-success', border: 'border-success', label: 'Success:' },
  error: { icon: alert, color: 'text-danger', border: 'border-danger', label: 'Error:' },
}

type Props = Omit<ComponentProps<'div'>, 'role' | 'children'> & {
  tone: keyof typeof TONES
  children: ReactNode
  action?: { label: string; ariaLabel?: string; busy?: boolean; onClick: () => void }
}

/** Errors interrupt (`alert`); info and success wait their turn (`status`). The tone is also text. */
export function Alert({ tone, action, children, className = '', ...rest }: Props) {
  const { icon, color, border, label } = TONES[tone]
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-3 rounded-panel border bg-surface-subtle p-4 text-body text-fg ${border} ${className}`}
      {...rest}
    >
      <Icon src={icon} className={color} />
      <p className="flex-1">
        <span className="sr-only">{label} </span>
        {children}
      </p>
      {action && (
        <button
          type="button"
          aria-label={action.ariaLabel}
          aria-disabled={action.busy || undefined}
          onClick={action.onClick}
          className="min-h-6 cursor-pointer px-2 aria-disabled:cursor-not-allowed aria-disabled:opacity-(--opacity-disabled) text-label font-medium text-fg underline"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}

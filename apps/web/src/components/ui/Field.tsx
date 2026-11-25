import { useId, type ComponentProps, type ReactNode } from 'react'

export type ControlProps = {
  id: string
  'aria-describedby'?: string | undefined
  'aria-invalid'?: true | undefined
}

type Props = Omit<ComponentProps<'div'>, 'children'> & {
  label: string
  help?: string
  error?: string
  children: (control: ControlProps) => ReactNode
}

/** Label, control, help and error. The control gets its ids and aria wiring through `children`. */
export function Field({ label, help, error, children, className = '', ...rest }: Props) {
  const id = useId()
  const [helpId, errorId] = [`${id}-help`, `${id}-error`]
  const describedBy = [help && helpId, error && errorId].filter(Boolean).join(' ')
  return (
    <div className={`flex flex-col gap-2 ${className}`} {...rest}>
      <label htmlFor={id} className="text-label font-medium text-fg">
        {label}
      </label>
      {children({
        id,
        'aria-describedby': describedBy || undefined,
        'aria-invalid': error ? true : undefined,
      })}
      {help && (
        <p id={helpId} className="text-caption text-fg-muted">
          {help}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-caption font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

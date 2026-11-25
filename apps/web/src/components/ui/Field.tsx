import { useId, type ComponentProps, type ReactNode } from 'react'

type ControlProps = {
  id: string
  'aria-describedby'?: string | undefined
  'aria-invalid'?: true | undefined
  required?: true | undefined
}

type Props = Omit<ComponentProps<'div'>, 'children'> & {
  label: string
  help?: string
  error?: string
  required?: boolean
  children: (control: ControlProps) => ReactNode
}

/** Label, control, help and error. The control gets its ids and aria wiring through `children`. */
export function Field({ label, help, error, required, children, className = '', ...rest }: Props) {
  const id = useId()
  const [helpId, errorId] = [`${id}-help`, `${id}-error`]
  const describedBy = [help && helpId, error && errorId].filter(Boolean).join(' ')
  return (
    <div className={`flex flex-col gap-2 ${className}`} {...rest}>
      <label htmlFor={id} className="text-label font-medium text-fg">
        {label}
        {required && ' (required)'}
      </label>
      {children({
        id,
        'aria-describedby': describedBy || undefined,
        'aria-invalid': error ? true : undefined,
        required: required ? true : undefined,
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

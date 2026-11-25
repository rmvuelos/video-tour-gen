import { useId, useState, type ComponentProps } from 'react'
import { FIELD_CLASS } from './Input'

// The live region only speaks in the last 10% of the limit: announcing every key would be noise.
const WARN_RATIO = 0.1

/** `className` goes to the wrapper (layout). With `maxLength` it shows "n / max" as the description. */
export function Textarea({
  className = '',
  maxLength,
  value,
  defaultValue,
  onChange,
  'aria-describedby': describedBy,
  ...rest
}: ComponentProps<'textarea'>) {
  const counterId = useId()
  const [typed, setTyped] = useState(String(defaultValue ?? '').length)
  const length = value === undefined ? typed : String(value).length
  const remaining = maxLength === undefined ? undefined : maxLength - length
  const warn = remaining !== undefined && remaining <= maxLength! * WARN_RATIO
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <textarea
        className={`min-h-32 resize-y py-3 ${FIELD_CLASS}`}
        maxLength={maxLength}
        value={value}
        defaultValue={defaultValue}
        aria-describedby={
          [describedBy, maxLength !== undefined && counterId].filter(Boolean).join(' ') || undefined
        }
        onChange={(e) => {
          setTyped(e.target.value.length)
          onChange?.(e)
        }}
        {...rest}
      />
      {maxLength !== undefined && (
        <>
          <p id={counterId} className="self-end text-caption text-fg-muted">
            {length.toLocaleString('en-US')} / {maxLength.toLocaleString('en-US')}
          </p>
          <span role="status" className="sr-only">
            {warn && `${remaining} characters remaining`}
          </span>
        </>
      )}
    </div>
  )
}

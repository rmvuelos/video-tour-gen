import { useId, useState, type ComponentProps } from 'react'
import { FIELD_CLASS } from './Input'

// The live region only changes at these remaining counts: announcing every key would be noise.
const THRESHOLDS = [200, 100, 50, 10, 0]

function announcement(remaining: number): string {
  const step = THRESHOLDS.findLast((t) => remaining <= t)
  if (step === undefined) return ''
  if (step === 0) return 'Character limit reached'
  return `${step} ${step === 1 ? 'character' : 'characters'} or fewer remaining`
}

/** With `maxLength` it shows "n / max" as the description. */
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
  const remaining = maxLength === undefined ? undefined : Math.max(0, maxLength - length)
  return (
    <div className="flex flex-col gap-1">
      <textarea
        className={`min-h-32 resize-y py-3 ${FIELD_CLASS} ${className}`}
        maxLength={maxLength}
        value={value}
        defaultValue={defaultValue}
        aria-describedby={
          [describedBy, maxLength !== undefined && counterId].filter(Boolean).join(' ') || undefined
        }
        onChange={(e) => {
          if (value === undefined) setTyped(e.target.value.length)
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
            {remaining !== undefined && announcement(remaining)}
          </span>
        </>
      )}
    </div>
  )
}

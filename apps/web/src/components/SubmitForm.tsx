import { useId, useRef, useState, type SubmitEvent } from 'react'
import { areaError, DESCRIPTION_MAX, descriptionError, parseArea } from '../lib/details'
import type { SubmitOptions } from '../lib/uploads'
import { Button } from './ui/Button'
import { Field } from './ui/Field'
import { Input } from './ui/Input'
import { Textarea } from './ui/Textarea'

export type Details = { area: string; description: string }

type Props = {
  /** From `canSubmit`: why sending is blocked, or ok. */
  check: { ok: true } | { ok: false; reason: string }
  values: Details
  onChange: (values: Details) => void
  submitting: boolean
  onSend: (options: SubmitOptions) => void
  /** Text for the shared live region (why a blocked press did nothing). */
  announce: (text: string) => void
}

/** Optional details (area, description) and the button that sends the project. */
export function SubmitForm({ check, values, onChange, submitting, onSend, announce }: Props) {
  // Errors show after the first blur or send attempt, then follow the text.
  const [touched, setTouched] = useState({ area: false, description: false })
  const areaInput = useRef<HTMLInputElement>(null)
  const descriptionInput = useRef<HTMLTextAreaElement>(null)
  const hintId = useId()
  const headingId = useId()

  const shownAreaError = touched.area ? areaError(values.area) : undefined
  const shownDescriptionError = touched.description
    ? descriptionError(values.description)
    : undefined
  const blocked = !check.ok || submitting

  function send(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (blocked) {
      if (!check.ok && !submitting) announce(check.reason)
      return
    }
    setTouched({ area: true, description: true })
    const parsed = parseArea(values.area)
    if (areaError(values.area) || parsed.value === undefined) {
      return void areaInput.current?.focus()
    }
    if (descriptionError(values.description)) return void descriptionInput.current?.focus()
    onSend({
      plan_page_index: 0, // the PDF page picker comes later
      area_m2: parsed.value,
      description: values.description.trim() ? values.description : null,
    })
  }

  return (
    <form noValidate onSubmit={send} className="flex flex-col gap-6">
      <section aria-labelledby={headingId} className="flex flex-col gap-6">
        <h2 id={headingId} className="text-title-sm font-semibold">
          Details (optional)
        </h2>
        <Field
          label="Area (m²)"
          help="Helps place the walls to scale."
          {...(shownAreaError && { error: shownAreaError })}
        >
          {(control) => (
            <Input
              {...control}
              ref={areaInput}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={values.area}
              onChange={(e) => onChange({ ...values, area: e.target.value })}
              onBlur={() => setTouched((t) => ({ ...t, area: true }))}
            />
          )}
        </Field>
        <Field label="Description" {...(shownDescriptionError && { error: shownDescriptionError })}>
          {(control) => (
            <Textarea
              {...control}
              ref={descriptionInput}
              maxLength={DESCRIPTION_MAX}
              value={values.description}
              onChange={(e) => onChange({ ...values, description: e.target.value })}
              onBlur={() => setTouched((t) => ({ ...t, description: true }))}
            />
          )}
        </Field>
      </section>
      <p id={hintId} className="text-body text-fg-muted">
        {submitting ? 'Sending your files…' : check.ok ? 'All files are uploaded.' : check.reason}
      </p>
      <div>
        {/* Becomes "Continue to preflight" when the preflight step ships (D-09). */}
        <Button type="submit" aria-describedby={hintId} {...(blocked && { 'aria-disabled': true })}>
          Check my files
        </Button>
      </div>
    </form>
  )
}

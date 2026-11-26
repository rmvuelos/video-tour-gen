import { useId, useRef, useState, type ReactNode, type SubmitEvent } from 'react'
import { flushSync } from 'react-dom'
import { areaError, DESCRIPTION_MAX, descriptionError, parseArea } from '../lib/details'
import type { SubmitOptions } from '../lib/uploads'
import { DetailsCard } from './DetailsCard'
import { Button } from './ui/Button'
import { Field } from './ui/Field'
import { Input } from './ui/Input'
import { Textarea } from './ui/Textarea'

export type Details = { area: string; description: string }

type Props = {
  /** The dropzones and their files, above the optional details. */
  children: ReactNode
  /** The summary card, beside the dropzones on wide screens. */
  overview: ReactNode
  /** From `canSubmit`: why sending is blocked, or ok. */
  check: { ok: true } | { ok: false; reason: string }
  values: Details
  onChange: (values: Details) => void
  submitting: boolean
  onSend: (options: SubmitOptions) => void
  /** Text for the shared live region (why a blocked press did nothing). */
  announce: (text: string) => void
}

/** The whole upload form: the files, the optional details and the bar with the send button. */
export function SubmitForm({
  children,
  overview,
  check,
  values,
  onChange,
  submitting,
  onSend,
  announce,
}: Props) {
  // Errors show after the first blur or send attempt, then follow the text.
  const [touched, setTouched] = useState({ area: false, description: false })
  // Open from the start when the project already has details.
  const [open, setOpen] = useState(() => values.area !== '' || values.description !== '')
  const areaInput = useRef<HTMLInputElement>(null)
  const descriptionInput = useRef<HTMLTextAreaElement>(null)
  const hintId = useId()

  const shownAreaError = touched.area ? areaError(values.area) : undefined
  const shownDescriptionError = touched.description
    ? descriptionError(values.description)
    : undefined
  const blocked = !check.ok || submitting

  /** Opens the details first (flushed), so a hidden field can take the focus. */
  function focusField(field: 'area' | 'description') {
    flushSync(() => setOpen(true))
    ;(field === 'area' ? areaInput : descriptionInput).current?.focus()
  }

  function send(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (blocked) {
      if (!check.ok && !submitting) announce(check.reason)
      return
    }
    setTouched({ area: true, description: true })
    const parsed = parseArea(values.area)
    if (areaError(values.area) || parsed.value === undefined) return focusField('area')
    if (descriptionError(values.description)) return focusField('description')
    onSend({
      plan_page_index: 0, // the PDF page picker comes later
      area_m2: parsed.value,
      description: values.description.trim() ? values.description : null,
    })
  }

  return (
    <form noValidate onSubmit={send} className="flex flex-col gap-8">
      <div className="@container">
        <div className="grid gap-x-card gap-y-card-gap @min-summary:grid-cols-[minmax(0,1fr)_var(--spacing-summary)]">
          <div className="flex min-w-0 flex-col gap-card-gap">
            {children}
            <DetailsCard open={open} onToggle={() => setOpen((o) => !o)}>
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
              <Field
                label="Description"
                {...(shownDescriptionError && { error: shownDescriptionError })}
              >
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
            </DetailsCard>
          </div>
          {overview}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4 border-t border-line pt-4">
        <p className="text-label text-fg-muted">Secure uploads · PDF, PNG, JPG and WebP accepted</p>
        <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-2">
          <p id={hintId} className="text-body text-fg-muted">
            {submitting
              ? 'Sending your files…'
              : check.ok
                ? 'All files are uploaded.'
                : check.reason}
          </p>
          {/* Becomes "Continue to preflight" when the preflight step ships (D-09). */}
          <Button
            type="submit"
            variant="cta"
            aria-describedby={hintId}
            {...(blocked && { 'aria-disabled': true })}
          >
            Check my files
          </Button>
        </div>
      </div>
    </form>
  )
}

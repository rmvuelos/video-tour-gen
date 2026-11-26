import { useId, useRef, useState, type SubmitEvent } from 'react'
import { areaError, DESCRIPTION_MAX, descriptionError, parseArea } from '../lib/details'
import { useSubmit } from '../lib/use-submit'
import type { Job } from '../lib/uploads'
import { Alert } from './ui/Alert'
import { Button } from './ui/Button'
import { Field } from './ui/Field'
import { Input } from './ui/Input'
import { Textarea } from './ui/Textarea'

type Props = {
  projectId: string
  /** From `canSubmit`: why sending is blocked, or ok. */
  check: { ok: true } | { ok: false; reason: string }
  initial?:
    { area_m2?: number | null | undefined; description?: string | null | undefined } | undefined
  onSubmitted: (job: Job) => void
  onFileErrors: (errors: { id: string; error: string }[]) => void
}

/** Optional details (area, description) and the button that sends the project. */
export function SubmitForm({ projectId, check, initial, onSubmitted, onFileErrors }: Props) {
  const [area, setArea] = useState(initial?.area_m2 == null ? '' : String(initial.area_m2))
  const [description, setDescription] = useState(initial?.description ?? '')
  // Errors show after the first blur or send attempt, then follow the text.
  const [touched, setTouched] = useState({ area: false, description: false })
  const areaInput = useRef<HTMLInputElement>(null)
  const descriptionInput = useRef<HTMLTextAreaElement>(null)
  const hintId = useId()
  const { submit, submitting, error } = useSubmit(projectId, { onSubmitted, onFileErrors })

  const shownAreaError = touched.area ? areaError(area) : undefined
  const shownDescriptionError = touched.description ? descriptionError(description) : undefined
  const blocked = !check.ok || submitting

  function send(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (blocked) return
    setTouched({ area: true, description: true })
    const parsed = parseArea(area)
    if (parsed.value === undefined) return void areaInput.current?.focus()
    if (descriptionError(description)) return void descriptionInput.current?.focus()
    void submit({
      plan_page_index: 0, // the PDF page picker comes later
      area_m2: parsed.value,
      description: description.trim() ? description : null,
    })
  }

  return (
    <form noValidate onSubmit={send} className="flex flex-col gap-6">
      <h2 className="text-title-sm font-semibold">Details (optional)</h2>
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
            value={area}
            onChange={(e) => setArea(e.target.value)}
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
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, description: true }))}
          />
        )}
      </Field>
      {error && <Alert tone="error">{error}</Alert>}
      <p id={hintId} className="text-body text-fg-muted">
        {submitting ? 'Sending your files…' : check.ok ? 'All files are uploaded.' : check.reason}
      </p>
      <div>
        <Button type="submit" aria-describedby={hintId} {...(blocked && { 'aria-disabled': true })}>
          Continue to preflight
        </Button>
      </div>
    </form>
  )
}

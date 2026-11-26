import { useEffect, useRef, useState } from 'react'
import type { FileRejection } from 'react-dropzone'
import limits from '../../../../shared/input-limits.json'
import fileIcon from '../assets/icons/file.svg'
import imageIcon from '../assets/icons/image.svg'
import { formatBytes } from '../lib/format-bytes'
import {
  fullMessage,
  rejectionMessage,
  type FileKind,
  type RejectionReason,
} from '../lib/upload-rules'
import { useUploader } from '../lib/use-uploader'
import type { UploaderItem } from '../lib/uploader-reducer'
import { useSubmit } from '../lib/use-submit'
import type { Job } from '../lib/uploads'
import { SubmitForm, type Details } from './SubmitForm'
import { Alert } from './ui/Alert'
import { Dropzone } from './ui/Dropzone'
import { FileCard } from './ui/FileCard'

const accept = (types: readonly string[]) => Object.fromEntries(types.map((t) => [t, []]))

const SECTIONS = {
  plan: {
    title: 'Floor plan',
    label: 'Floor plan files',
    button: 'Choose plan',
    icon: fileIcon,
    accept: accept(limits.floorPlan.mimeTypes),
    maxSize: limits.floorPlan.maxBytes,
    help: `PDF, PNG or JPG. One file, up to ${formatBytes(limits.floorPlan.maxBytes)}.`,
  },
  photo: {
    title: 'Photos',
    label: 'Photo files',
    button: 'Choose photos',
    icon: imageIcon,
    accept: accept(limits.photos.mimeTypes),
    maxSize: limits.photos.maxBytes,
    help: `JPG, PNG or WebP. ${limits.photos.minCount} to ${limits.photos.maxCount} photos, up to ${formatBytes(limits.photos.maxBytes)} each.`,
  },
} as const

const REASONS: Record<string, RejectionReason> = {
  'file-too-large': 'size',
  'too-many-files': 'count',
}

type CardState =
  | { status: 'pending' | 'uploaded' }
  | { status: 'uploading'; progress: number }
  | { status: 'error'; error: string; action?: { label: string; onClick: () => void } }

function cardState(item: UploaderItem, retry: () => void): CardState {
  if (item.status === 'uploading')
    return { status: 'uploading', progress: (item.progress ?? 0) * 100 }
  if (item.status === 'failed') {
    return { status: 'error', error: item.error ?? '', action: { label: 'Retry', onClick: retry } }
  }
  if (item.status === 'invalid') return { status: 'error', error: item.error ?? '' }
  // `pending` is a finished PUT as far as this screen knows; submit verifies the objects.
  return { status: 'uploaded' }
}

/** The order the lists appear on screen: the plan first, then the photos. */
const inScreenOrder = (items: UploaderItem[]) => [
  ...items.filter((i) => i.kind === 'plan'),
  ...items.filter((i) => i.kind === 'photo'),
]

/** Plan and photo dropzones with their files, wired to useUploader. */
export function Uploader({
  projectId,
  initial,
  onSubmitted,
  onNotEditable,
}: {
  projectId: string
  initial?: { area_m2?: number | null | undefined; description?: string | null | undefined }
  onSubmitted: (job: Job) => void
  /** The server says the project was already sent: the page reads it again. */
  onNotEditable: () => void
}) {
  const up = useUploader(projectId)
  const root = useRef<HTMLDivElement>(null)
  // What to focus once a removed card is gone: a file id, or a kind for its dropzone button.
  const focusNext = useRef<{ file: string } | { zone: FileKind } | { invalid: string } | null>(null)
  const seeded = useRef(false)
  // Kept here, not in the form: a reload of the files must not lose what was typed.
  const [details, setDetails] = useState<Details>({
    area: initial?.area_m2 == null ? '' : String(initial.area_m2),
    description: initial?.description ?? '',
  })
  const send = useSubmit(projectId, {
    onSubmitted,
    onFileErrors: refuse,
    onStale: up.reload,
    onNotEditable,
  })

  useEffect(() => {
    // A project that comes back from the ingest with invalid files: start at the first one.
    if (!seeded.current && up.phase === 'ready') {
      seeded.current = true
      const first = inScreenOrder(up.items).find((i) => i.status === 'invalid')
      if (first) focusNext.current = { invalid: first.id }
    }
    const target = focusNext.current
    if (!target || !root.current) return
    focusNext.current = null
    const id = 'file' in target ? target.file : 'invalid' in target ? target.invalid : null
    const selector = id ? '[data-file-id]' : `[data-zone="${'zone' in target ? target.zone : ''}"]`
    const holder = [...root.current.querySelectorAll<HTMLElement>(selector)].find(
      (el) => !id || el.dataset.fileId === id,
    )
    // The error text, not Remove, for invalid files: Enter on Remove would delete the file.
    const control = !id
      ? 'button'
      : 'invalid' in target
        ? '[data-file-error]'
        : 'button[aria-label^="Remove"]'
    holder?.querySelector<HTMLElement>(control)?.focus()
  }, [up.items, up.phase])

  function remove(item: UploaderItem) {
    const list = up.items.filter((i) => i.kind === item.kind)
    const at = list.findIndex((i) => i.id === item.id)
    const near = list[at + 1] ?? list[at - 1]
    if (!up.remove(item.id)) return
    focusNext.current = near ? { file: near.id } : { zone: item.kind }
  }

  /** The server refused some files on submit: mark them and move focus to the first on screen. */
  function refuse(errors: { id: string; error: string }[]): boolean {
    const first = inScreenOrder(up.items).find((i) => errors.some((e) => e.id === i.id))
    if (!first) return false
    up.markInvalid(errors)
    focusNext.current = { invalid: first.id }
    return true
  }

  const submitError = send.error && <Alert tone="error">{send.error}</Alert>
  const invalid = up.items.filter((i) => i.status === 'invalid').length

  // One live region for the whole screen, mounted from the start so announcements are heard.
  const status = (
    <p role="status" aria-label="Upload status" className="sr-only">
      {up.phase === 'loading' ? 'Loading files…' : up.announcement}
    </p>
  )
  if (up.phase === 'loading') {
    return (
      <div>
        {status}
        {submitError}
        <p aria-hidden="true" className="text-body text-fg-muted">
          Loading files…
        </p>
      </div>
    )
  }
  if (up.phase === 'error') {
    return (
      <div>
        {status}
        <Alert tone="error" action={{ label: 'Try again', onClick: up.reload }}>
          {up.loadError}
        </Alert>
      </div>
    )
  }

  return (
    <div ref={root} className="flex flex-col gap-8">
      {status}
      {invalid > 0 && (
        <Alert tone="error">
          {invalid} {invalid === 1 ? 'file needs' : 'files need'} fixing
        </Alert>
      )}
      {submitError}
      {up.error && <Alert tone="error">{up.error}</Alert>}
      {(Object.keys(SECTIONS) as FileKind[]).map((kind) => {
        const s = SECTIONS[kind]
        const slots = up.slots[kind]
        return (
          <section key={kind} className="flex flex-col gap-4">
            <Dropzone
              data-zone={kind}
              title={s.title}
              titleLevel={2}
              help={s.help}
              buttonLabel={s.button}
              icon={s.icon}
              accept={s.accept}
              maxSize={s.maxSize}
              maxFiles={slots}
              disabled={slots === 0}
              {...(slots === 0 && { disabledReason: fullMessage(kind) })}
              onFilesAccepted={(files) => void up.add(kind, files)}
              rejectionText={({ file, errors }: FileRejection) =>
                rejectionMessage(file, kind, REASONS[errors[0]?.code ?? ''] ?? 'type', slots)
              }
            />
            {up.items.some((i) => i.kind === kind) && (
              <ul role="list" aria-label={s.label} className="flex flex-col gap-3">
                {up.items
                  .filter((i) => i.kind === kind)
                  .map((item) => (
                    <li key={item.id} data-file-id={item.id}>
                      <FileCard
                        file={
                          item.file ?? { name: item.filename, size: item.size, type: item.mime }
                        }
                        onRemove={() => remove(item)}
                        {...cardState(item, () => void up.retry(item.id))}
                      />
                    </li>
                  ))}
              </ul>
            )}
          </section>
        )
      })}
      <SubmitForm
        check={up.submit}
        values={details}
        onChange={setDetails}
        submitting={send.submitting}
        onSend={(options) => {
          up.announce('Sending your files…')
          void send.submit(options)
        }}
        announce={up.announce}
      />
    </div>
  )
}

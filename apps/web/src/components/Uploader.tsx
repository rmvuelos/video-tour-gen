import { useEffect, useRef } from 'react'
import type { FileRejection } from 'react-dropzone'
import limits from '../../../../shared/input-limits.json'
import fileIcon from '../assets/icons/file.svg'
import imageIcon from '../assets/icons/image.svg'
import { formatBytes } from '../lib/format-bytes'
import { rejectionMessage, type FileKind, type RejectionReason } from '../lib/upload-rules'
import { useUploader } from '../lib/use-uploader'
import type { UploaderItem } from '../lib/uploader-reducer'
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

/** Plan and photo dropzones with their files, wired to useUploader. */
export function Uploader({ projectId }: { projectId: string }) {
  const up = useUploader(projectId)
  const root = useRef<HTMLDivElement>(null)
  // What to focus once a removed card is gone: a file id, or a kind for its dropzone button.
  const focusNext = useRef<{ file: string } | { zone: FileKind } | null>(null)

  useEffect(() => {
    const target = focusNext.current
    if (!target || !root.current) return
    focusNext.current = null
    const selector = 'file' in target ? '[data-file-id]' : `[data-zone="${target.zone}"]`
    const holder = [...root.current.querySelectorAll<HTMLElement>(selector)].find(
      (el) => !('file' in target) || el.dataset.fileId === target.file,
    )
    holder
      ?.querySelector<HTMLElement>('file' in target ? 'button[aria-label^="Remove"]' : 'button')
      ?.focus()
  }, [up.items])

  function remove(item: UploaderItem) {
    const list = up.items.filter((i) => i.kind === item.kind)
    const at = list.findIndex((i) => i.id === item.id)
    const near = list[at + 1] ?? list[at - 1]
    focusNext.current = near ? { file: near.id } : { zone: item.kind }
    void up.remove(item.id)
  }

  if (up.phase === 'loading') return <p className="text-body text-fg-muted">Loading files…</p>
  if (up.phase === 'error') {
    return (
      <Alert tone="error" action={{ label: 'Try again', onClick: up.reload }}>
        {up.loadError}
      </Alert>
    )
  }

  return (
    <div ref={root} className="flex flex-col gap-8">
      <p role="status" className="sr-only">
        {up.announcement}
      </p>
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
              onFilesAccepted={(files) => void up.add(kind, files)}
              rejectionText={({ file, errors }: FileRejection) =>
                rejectionMessage(file, kind, REASONS[errors[0]?.code ?? ''] ?? 'type', slots)
              }
            />
            <ul aria-label={s.label} className="flex flex-col gap-3">
              {up.items
                .filter((i) => i.kind === kind)
                .map((item) => (
                  <li key={item.id} data-file-id={item.id}>
                    <FileCard
                      file={item.file ?? { name: item.filename, size: item.size, type: item.mime }}
                      onRemove={() => remove(item)}
                      {...cardState(item, () => void up.retry(item.id))}
                    />
                  </li>
                ))}
            </ul>
          </section>
        )
      })}
      <p className="text-body text-fg-muted">
        {up.submit.ok ? 'All files are uploaded.' : up.submit.reason}
      </p>
    </div>
  )
}

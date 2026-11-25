import { useId, useState, type ComponentProps } from 'react'
import { useDropzone, type Accept, type FileRejection } from 'react-dropzone'
import { formatBytes } from '../../lib/format-bytes'
import { Button } from './Button'
import { Card } from './Card'
import { Icon } from './Icon'

type Props = Omit<ComponentProps<'div'>, 'title' | 'children' | 'role'> & {
  title: string
  titleLevel?: 2 | 3 | 4
  /** The limits, in text, visible before dropping (see shared/input-limits.json). */
  help: string
  buttonLabel: string
  icon: string
  accept: Accept
  maxSize: number
  maxFiles: number
  disabled?: boolean
  onFilesAccepted: (files: File[]) => void
  onFilesRejected?: (rejections: FileRejection[]) => void
}

const FORMATS: Record<string, string> = {
  'image/jpeg': 'JPG',
  'image/png': 'PNG',
  'image/webp': 'WebP',
  'application/pdf': 'PDF',
}

/** "JPG, PNG or WebP", from the accepted MIME types. */
function formatList(accept: Accept): string {
  const names = Object.keys(accept).map(
    (mime) => FORMATS[mime] ?? mime.split('/')[1]!.toUpperCase(),
  )
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} or ${names.at(-1)}` : (names[0] ?? '')
}

function reason({ file, errors }: FileRejection, props: Props): string {
  const code = errors[0]?.code
  if (code === 'file-too-large')
    return `${file.name} is too large. The maximum is ${formatBytes(props.maxSize)}.`
  if (code === 'too-many-files') return `Too many files. The maximum is ${props.maxFiles}.`
  return `${file.name} is not a supported file type. Use ${formatList(props.accept)}.`
}

/** Presentational: it reports files, it uploads nothing. The button is the only tab stop. */
export function Dropzone(props: Props) {
  const {
    title,
    titleLevel = 3,
    help,
    buttonLabel,
    icon,
    accept,
    maxSize,
    maxFiles,
    disabled,
    onFilesAccepted,
    onFilesRejected,
    ref,
    ...rest
  } = props
  const [rejected, setRejected] = useState({ messages: [] as string[], drop: 0 })
  const [titleId, helpId] = [useId(), useId()]
  const Heading = `h${titleLevel}` as const
  const { getRootProps, getInputProps, open, isDragActive, isDragReject } = useDropzone({
    accept,
    maxSize,
    maxFiles,
    disabled: disabled ?? false,
    noClick: true,
    noKeyboard: true,
    // One message per distinct reason; a new drop remounts the list so it is announced again.
    onDrop: (_accepted, rejections) =>
      setRejected((prev) => ({
        messages: [...new Set(rejections.map((r) => reason(r, props)))],
        drop: prev.drop + 1,
      })),
    onDropAccepted: (files) => onFilesAccepted(files),
    onDropRejected: (rejections) => onFilesRejected?.(rejections),
  })
  // Dragging: solid stroke and a text, never only color. Idle: the dashed Figma border.
  const dash = isDragReject ? 'reject' : isDragActive ? 'active' : undefined
  const { rootRef, ...root } = getRootProps({
    ...rest,
    refKey: 'rootRef',
    role: 'group',
    'aria-labelledby': titleId,
  }) as ReturnType<typeof getRootProps> & { rootRef: { current: HTMLDivElement | null } }
  return (
    <div
      {...root}
      ref={(node) => {
        rootRef.current = node
        if (typeof ref === 'function') ref(node)
        else if (ref) ref.current = node
      }}
    >
      <input {...getInputProps()} />
      <Card className="relative flex min-h-dropzone flex-col items-center justify-center gap-4 p-card text-center">
        <span aria-hidden="true" data-dash={dash} className="dash-border" />
        <span className="inline-flex size-tile items-center justify-center rounded-card-lg bg-tile text-fg-accent">
          <Icon src={icon} size="lg" />
        </span>
        <Heading id={titleId} className="text-title-sm font-medium">
          {title}
        </Heading>
        <p id={helpId} className="text-body text-fg-muted">
          {help}
        </p>
        {dash && (
          <p className="text-body font-medium">
            {isDragReject ? 'This file type is not supported' : 'Drop to upload'}
          </p>
        )}
        <Button onClick={open} disabled={disabled} aria-describedby={helpId}>
          {buttonLabel}
        </Button>
        {rejected.messages.length > 0 && (
          <ul key={rejected.drop} role="alert" className="text-caption font-medium text-danger">
            {rejected.messages.map((m, i) => (
              <li key={`${i}-${m}`}>{m}</li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

import { useState } from 'react'
import { useDropzone, type Accept, type ErrorCode, type FileRejection } from 'react-dropzone'
import { formatBytes } from '../../lib/format-bytes'
import { Button } from './Button'
import { Card } from './Card'
import { Icon } from './Icon'

type Props = {
  title: string
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
  className?: string
}

function reason({ file, errors }: FileRejection, maxSize: number, maxFiles: number): string {
  const code = errors[0]?.code as ErrorCode | undefined
  if (code === 'file-too-large')
    return `${file.name} is too large. The maximum is ${formatBytes(maxSize)}.`
  if (code === 'too-many-files') return `Too many files. The maximum is ${maxFiles}.`
  return `${file.name} is not a supported file type.`
}

/** Presentational: it reports files, it uploads nothing. The button is the only tab stop. */
export function Dropzone({
  title,
  help,
  buttonLabel,
  icon,
  accept,
  maxSize,
  maxFiles,
  disabled,
  onFilesAccepted,
  onFilesRejected,
  className = '',
}: Props) {
  const [rejections, setRejections] = useState<FileRejection[]>([])
  const { getRootProps, getInputProps, open, isDragActive, isDragReject } = useDropzone({
    accept,
    maxSize,
    maxFiles,
    disabled: disabled ?? false,
    noClick: true,
    noKeyboard: true,
    onDrop: (_accepted, rejected) => setRejections(rejected),
    onDropAccepted: (files) => onFilesAccepted(files),
    onDropRejected: (rejected) => onFilesRejected?.(rejected),
  })
  // Dragging: solid stroke and a text, never only color. Idle: the dashed Figma border.
  const dash = isDragReject ? 'reject' : isDragActive ? 'active' : undefined
  return (
    <div {...getRootProps()} className={className}>
      <input {...getInputProps()} />
      <Card className="relative flex min-h-dropzone flex-col items-center justify-center gap-4 p-card text-center">
        <span aria-hidden="true" data-dash={dash} className="dash-border" />
        <span className="inline-flex size-tile items-center justify-center rounded-card-lg bg-tile text-fg-accent">
          <Icon src={icon} size="lg" />
        </span>
        <h3 className="text-title-sm font-medium">{title}</h3>
        <p className="text-body text-fg-muted">
          {isDragReject
            ? 'This file type is not supported'
            : isDragActive
              ? 'Drop to upload'
              : help}
        </p>
        <Button onClick={open} disabled={disabled}>
          {buttonLabel}
        </Button>
        {rejections.length > 0 && (
          <ul role="alert" className="text-caption font-medium text-danger">
            {rejections.map((r) => (
              <li key={r.file.name}>{reason(r, maxSize, maxFiles)}</li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

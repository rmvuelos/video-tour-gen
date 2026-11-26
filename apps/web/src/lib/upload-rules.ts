import limits from '../../../../shared/input-limits.json'
import { formatBytes } from './format-bytes'

export type FileKind = 'plan' | 'photo'
export type RejectionReason = 'type' | 'size' | 'count'

const RULES = {
  plan: {
    max: limits.floorPlan.maxCount,
    bytes: limits.floorPlan.maxBytes,
    formats: 'PDF, PNG or JPG',
  },
  photo: {
    max: limits.photos.maxCount,
    bytes: limits.photos.maxBytes,
    formats: 'JPG, PNG or WebP',
  },
} as const
const MIN_PHOTOS = limits.photos.minCount
const GENERIC = 'Something went wrong. Try again.'

const isHeic = ({ name, type }: { name: string; type: string }) =>
  /^image\/hei[cf]/i.test(type) || /\.hei[cf]$/i.test(name)
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

function countMessage(kind: FileKind, fit: number): string {
  if (fit > 0) {
    const verb = fit === 1 ? 'fits' : 'fit'
    return `Too many files: only ${plural(fit, 'more ' + kind)} ${verb}. Remove some or choose fewer.`
  }
  return kind === 'plan'
    ? 'The plan is already added. Remove it to choose another.'
    : `You already have ${plural(RULES.photo.max, 'photo')}. Remove one to add another.`
}

/** What fails and what to do, for a file the Dropzone refused. `fit` = slots left (count only). */
export function rejectionMessage(
  file: { name: string; size: number; type: string },
  kind: FileKind,
  reason: RejectionReason,
  fit = 0,
): string {
  if (reason === 'count') return countMessage(kind, fit)
  if (isHeic(file)) return `${file.name} is a HEIC photo. Export it as JPG and try again.`
  const { bytes, formats } = RULES[kind]
  if (reason === 'size') {
    return `${file.name} is ${formatBytes(file.size)}; the maximum is ${formatBytes(bytes)}. Reduce it or choose another file.`
  }
  return `${file.name} is not a supported file type. Use ${formats}.`
}

/** How many more files of this kind fit, counting those already in the project. */
export const remainingSlots = (kind: FileKind, existingCount: number) =>
  Math.max(0, RULES[kind].max - existingCount)

type Check = { ok: true } | { ok: false; reason: string }

/**
 * Server statuses (GET /files) plus the two local ones of a browser upload. The backend only sets
 * `uploaded` inside submit, so a file whose PUT finished (or after a reload) reads `pending`.
 */
export type UploadStatus = 'pending' | 'uploaded' | 'valid' | 'invalid' | 'uploading' | 'failed'

/**
 * Exactly one plan and 3-10 photos, none uploading, failed or invalid; otherwise the hint to show.
 * `pending` counts as done: submit verifies the objects and reports missing_object/size_mismatch.
 */
export function canSubmit(files: { kind: FileKind; status: UploadStatus }[]): Check {
  const plans = files.filter((f) => f.kind === 'plan').length
  const photos = files.filter((f) => f.kind === 'photo').length
  const fail = (reason: string): Check => ({ ok: false, reason })
  if (plans === 0) return fail('Add the floor plan.')
  if (plans > RULES.plan.max) return fail('Remove the extra plan: only one is allowed.')
  if (photos < MIN_PHOTOS) return fail(`Add at least ${plural(MIN_PHOTOS - photos, 'more photo')}.`)
  if (photos > RULES.photo.max) {
    return fail(
      `Remove ${plural(photos - RULES.photo.max, 'photo')}: the maximum is ${RULES.photo.max}.`,
    )
  }
  if (files.some((f) => f.status === 'invalid')) {
    return fail('Remove or replace the files with errors.')
  }
  if (files.some((f) => f.status === 'failed')) {
    return fail('Retry or remove the files that failed to upload.')
  }
  if (files.some((f) => f.status === 'uploading')) return fail('Wait for the uploads to finish.')
  return { ok: true }
}

const TOO_LARGE = 'The file is too large. Reduce it or choose another.'
const NOT_FINISHED = 'The upload did not finish. Upload the file again.'
const MESSAGES: Record<string, string> = {
  too_large: TOO_LARGE,
  file_too_large: TOO_LARGE,
  unsupported_type: 'This file type is not supported. Use JPG, PNG, WebP or PDF (plan).',
  too_many_files: 'Too many files. Remove some and try again.',
  too_many_plans: 'Only one floor plan is allowed. Remove the extra one.',
  too_few_photos: `Add at least ${MIN_PHOTOS} photos.`,
  missing_plan: 'Add the floor plan.',
  missing_object: NOT_FINISHED,
  original_missing: NOT_FINISHED,
  size_mismatch: 'The uploaded file does not match the chosen one. Upload it again.',
  files_changed: 'The files changed while sending. Review them and try again.',
  project_not_editable: "This project was already sent, so its files can't be changed.",
  invalid_file: 'This file has errors. Replace or remove it.',
  enqueue_failed: 'We could not start processing. Try again in a moment.',
  job_not_failed: 'There is nothing to retry.',
  worker_lost: 'Processing was interrupted. Try again.',
  invalid_files: 'Some files are not valid. Fix them and try again.',
  kind_mismatch:
    'This file is in the wrong place. Use a plan for the plan and photos for the rest.',
  corrupt_file: 'The file is damaged or unreadable. Choose another one.',
  too_large_pixels: 'The image has too many pixels. Reduce its resolution and try again.',
  pdf_encrypted: 'The PDF is password protected. Remove the password and try again.',
  pdf_too_many_pages: `The PDF has more than ${limits.floorPlan.maxPdfPages} pages. Use a shorter one.`,
  pdf_page_out_of_range: 'That PDF page does not exist. Choose another page.',
  empty_file: 'The file is empty. Choose another one.',
}

/** Short user message for a backend or ingest error code, prefixed with the file name if given. */
export function errorCodeMessage(code: string | null, filename?: string): string {
  const known = code !== null && Object.hasOwn(MESSAGES, code) ? MESSAGES[code] : undefined
  const message = known ?? GENERIC
  return filename ? `${filename}: ${message}` : message
}

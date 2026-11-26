import { describe, expect, it } from 'vitest'
import type { UploadStatus } from './upload-rules'
import {
  canSubmit,
  errorCodeMessage,
  rejectionMessage,
  remainingSlots,
  sourceProgress,
} from './upload-rules'

const jpg = { name: 'kitchen.jpg', size: 1000, type: 'image/jpeg' }
const gif = { name: 'a.gif', size: 10, type: 'image/gif' }
const state = (kind: 'plan' | 'photo', status: UploadStatus) => ({ kind, status })
const photos = (n: number, status: UploadStatus = 'uploaded') =>
  Array.from({ length: n }, () => state('photo', status))
const plan = state('plan', 'valid')

describe('rejectionMessage', () => {
  it('asks to export a HEIC photo as JPG, detected by type', () => {
    const file = { name: 'IMG_1.bin', size: 5, type: 'image/heic' }
    expect(rejectionMessage(file, 'photo', 'type')).toBe(
      'IMG_1.bin is a HEIC photo. Export it as JPG and try again.',
    )
  })

  it('detects HEIF by extension when the browser gives no type', () => {
    const file = { name: 'IMG_2.HEIF', size: 5, type: '' }
    expect(rejectionMessage(file, 'photo', 'type')).toContain('is a HEIC photo')
  })

  it('states size and maximum for a too large photo', () => {
    const file = { ...jpg, size: 13 * 1024 * 1024 }
    expect(rejectionMessage(file, 'photo', 'size')).toBe(
      'kitchen.jpg is 13 MB; the maximum is 12 MB. Reduce it or choose another file.',
    )
  })

  it('uses the plan maximum for a too large plan', () => {
    const file = { name: 'plan.pdf', size: 30 * 1024 * 1024, type: 'application/pdf' }
    expect(rejectionMessage(file, 'plan', 'size')).toContain('the maximum is 20 MB')
  })

  it('lists the accepted formats for an unsupported type', () => {
    expect(rejectionMessage(gif, 'photo', 'type')).toBe(
      'a.gif is not a supported file type. Use JPG, PNG or WebP.',
    )
    expect(rejectionMessage(gif, 'plan', 'type')).toContain('Use PDF, PNG or JPG.')
  })

  it('says how many more files fit when there are too many', () => {
    expect(rejectionMessage(jpg, 'photo', 'count', 2)).toBe(
      'Too many files: only 2 more photos fit. Remove some or choose fewer.',
    )
    expect(rejectionMessage(jpg, 'photo', 'count', 1)).toContain('only 1 more photo fits')
  })

  it('says the limit is reached when no slot is left', () => {
    expect(rejectionMessage(jpg, 'plan', 'count', 0)).toBe(
      'The plan is already added. Remove it to choose another.',
    )
    expect(rejectionMessage(jpg, 'photo', 'count', 0)).toContain('10 photos')
  })
})

describe('remainingSlots', () => {
  it.each([
    ['plan', 0, 1],
    ['plan', 1, 0],
    ['photo', 0, 10],
    ['photo', 4, 6],
    ['photo', 10, 0],
    ['photo', 12, 0],
  ] as const)('%s with %i existing leaves %i', (kind, existing, left) => {
    expect(remainingSlots(kind, existing)).toBe(left)
  })
})

describe('canSubmit', () => {
  it('accepts one plan and three uploaded photos', () => {
    expect(canSubmit([plan, ...photos(3)])).toEqual({ ok: true })
  })

  it('accepts valid and uploaded files mixed, up to 10 photos', () => {
    const files = [state('plan', 'uploaded'), ...photos(9), state('photo', 'valid')]
    expect(canSubmit(files).ok).toBe(true)
  })

  it('asks for the plan when it is missing, including an empty list', () => {
    expect(canSubmit(photos(3))).toEqual({ ok: false, reason: 'Add the floor plan.' })
    expect(canSubmit([]).ok).toBe(false)
  })

  it('asks for the missing photos with the right plural', () => {
    expect(canSubmit([plan, ...photos(1)])).toEqual({
      ok: false,
      reason: 'Add at least 2 more photos.',
    })
    expect(canSubmit([plan, ...photos(2)])).toEqual({
      ok: false,
      reason: 'Add at least 1 more photo.',
    })
  })

  it('rejects more than one plan or more than 10 photos', () => {
    expect(canSubmit([plan, plan, ...photos(3)]).ok).toBe(false)
    expect(canSubmit([plan, ...photos(11)])).toEqual({
      ok: false,
      reason: 'Remove 1 photo: the maximum is 10.',
    })
  })

  it('counts server-pending files as done, since submit verifies the objects', () => {
    expect(canSubmit([state('plan', 'pending'), ...photos(3, 'pending')])).toEqual({ ok: true })
  })

  it('waits for files still uploading', () => {
    expect(canSubmit([plan, ...photos(3), state('photo', 'uploading')])).toEqual({
      ok: false,
      reason: 'Wait for the uploads to finish.',
    })
  })

  it('asks to retry or remove files that failed to upload', () => {
    expect(canSubmit([plan, ...photos(3), state('photo', 'failed')])).toEqual({
      ok: false,
      reason: 'Retry or remove the files that failed to upload.',
    })
  })

  it('asks to replace files the server marked invalid', () => {
    expect(canSubmit([plan, ...photos(3), state('photo', 'invalid')])).toEqual({
      ok: false,
      reason: 'Remove or replace the files with errors.',
    })
  })
})

describe('errorCodeMessage', () => {
  it.each([
    'too_large',
    'unsupported_type',
    'too_many_files',
    'too_many_plans',
    'too_few_photos',
    'missing_plan',
    'missing_object',
    'size_mismatch',
    'files_changed',
    'project_not_editable',
    'invalid_files',
    'kind_mismatch',
    'corrupt_file',
    'too_large_pixels',
    'pdf_encrypted',
    'pdf_too_many_pages',
    'pdf_page_out_of_range',
    'empty_file',
    'file_too_large',
    'original_missing',
  ])('has a specific message for %s', (code) => {
    expect(errorCodeMessage(code)).not.toBe(errorCodeMessage('something_new'))
  })

  it.each([
    ['invalid_file', 'This file has errors. Replace or remove it.'],
    ['enqueue_failed', 'We could not start processing. Try again in a moment.'],
    ['job_not_failed', 'There is nothing to retry.'],
    ['worker_lost', 'Processing was interrupted. Try again.'],
    ['project_not_editable', "This project was already sent, so its files can't be changed."],
    ['too_many_files', 'Too many files. Remove some and try again.'],
    ['pdf_encrypted', 'The PDF is password protected. Remove the password and try again.'],
  ])('says exactly the right thing for %s', (code, text) => {
    expect(errorCodeMessage(code)).toBe(text)
  })

  it('prefixes the file name when given', () => {
    expect(errorCodeMessage('pdf_encrypted', 'plan.pdf')).toMatch(/^plan\.pdf: /)
  })

  it('falls back to a generic message for unknown, missing or inherited codes', () => {
    expect(errorCodeMessage('nope')).toBe('Something went wrong. Try again.')
    expect(errorCodeMessage(null, 'a.jpg')).toBe('a.jpg: Something went wrong. Try again.')
    expect(errorCodeMessage('constructor')).toBe('Something went wrong. Try again.')
  })
})

describe('sourceProgress', () => {
  it('counts no source with an empty project', () => {
    expect(sourceProgress([])).toEqual({
      plan: { count: 0, max: 1, met: false },
      photos: { count: 0, min: 3, max: 10, met: false },
      met: 0,
      total: 2,
    })
  })

  it('meets the plan with one finished file and the photos from three', () => {
    expect(sourceProgress([plan, ...photos(2)]).met).toBe(1)
    const full = sourceProgress([plan, ...photos(3)])
    expect(full).toMatchObject({ plan: { count: 1, met: true }, photos: { count: 3, met: true } })
    expect(full.met).toBe(2)
  })

  it('does not count files still uploading, failed or invalid', () => {
    const files = [
      state('plan', 'uploading'),
      ...photos(1),
      ...photos(1, 'failed'),
      ...photos(1, 'invalid'),
      ...photos(1, 'uploading'),
    ]
    expect(sourceProgress(files)).toMatchObject({
      plan: { count: 0, met: false },
      photos: { count: 1, met: false },
      met: 0,
    })
  })

  it('counts pending (a finished PUT) and valid files as done', () => {
    const files = [state('plan', 'pending'), ...photos(3, 'valid')]
    expect(sourceProgress(files).met).toBe(2)
  })
})

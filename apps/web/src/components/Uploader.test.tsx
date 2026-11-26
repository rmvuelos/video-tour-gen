import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiRequestError } from '../lib/api'
import { PutUploadError } from '../lib/put-upload'

const api = vi.hoisted(() => ({
  listFiles: vi.fn(),
  registerFiles: vi.fn(),
  deleteFile: vi.fn(),
  putUpload: vi.fn(),
  submitProject: vi.fn(),
}))
vi.mock('../lib/uploads', () => ({
  listFiles: api.listFiles,
  registerFiles: api.registerFiles,
  deleteFile: api.deleteFile,
  submitProject: api.submitProject,
}))
vi.mock('../lib/put-upload', async (orig) => ({
  ...(await orig<typeof import('../lib/put-upload')>()),
  putUpload: api.putUpload,
}))

import { Uploader } from './Uploader'

const serverFile = (id: string, over: object = {}) => ({
  id,
  kind: 'photo',
  filename: `${id}.jpg`,
  size: 1,
  mime: 'image/jpeg',
  status: 'pending',
  error_code: null,
  page_index: null,
  ...over,
})
const photos = (n: number) => Array.from({ length: n }, (_, i) => serverFile(`p${i + 1}`))
const jpg = (name: string) => new File(['x'], name, { type: 'image/jpeg' })

async function setup(files: object[] = []) {
  api.listFiles.mockResolvedValue({ files })
  const view = render(<Uploader projectId="p1" onSubmitted={vi.fn()} />)
  await screen.findByRole('heading', { name: 'Photos' })
  const [planInput, photoInput] =
    view.container.querySelectorAll<HTMLInputElement>('input[type=file]')
  return {
    user: userEvent.setup({ applyAccept: false }),
    planInput: planInput!,
    photoInput: photoInput!,
  }
}

beforeEach(() => {
  Object.values(api).forEach((m) => m.mockReset())
  api.deleteFile.mockResolvedValue(undefined)
  api.putUpload.mockResolvedValue(undefined)
  api.registerFiles.mockImplementation(async (_p: string, files: { kind: string }[]) => ({
    files: files.map((f, i) => ({
      file_id: `n${i}`,
      kind: f.kind,
      mime: 'image/jpeg',
      upload_url: 'https://s/x',
      headers: {},
    })),
  }))
})

describe('Uploader', () => {
  it('shows formats and limits as text before dropping', async () => {
    await setup()
    expect(screen.getByText(/PDF, PNG or JPG\. One file, up to 20 MB/)).toBeInTheDocument()
    expect(
      screen.getByText(/JPG, PNG or WebP\. 3 to 10 photos, up to 12 MB each/),
    ).toBeInTheDocument()
  })

  it('says how to continue, from what is already there', async () => {
    await setup(photos(2))
    expect(screen.getByText('Add the floor plan.')).toBeInTheDocument()
  })

  it('offers a retry when the file list does not load', async () => {
    api.listFiles.mockRejectedValueOnce(new Error('x'))
    render(<Uploader projectId="p1" onSubmitted={vi.fn()} />)
    api.listFiles.mockResolvedValue({ files: [] })
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'Photos' })).toBeInTheDocument()
  })

  it('explains a HEIC photo and how to fix it', async () => {
    const { user, photoInput } = await setup()
    await user.upload(photoInput, new File(['x'], 'hall.heic', { type: 'image/heic' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'hall.heic is a HEIC photo. Export it as JPG and try again.',
    )
    expect(api.registerFiles).not.toHaveBeenCalled()
  })

  it('counts the files already in the project as used slots', async () => {
    const { photoInput } = await setup(photos(9))
    fireEvent.change(photoInput, { target: { files: [jpg('a.jpg'), jpg('b.jpg')] } })
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many files: only 1 more photo fits.',
    )
    // The one that fits is still sent; the extra one is not.
    await waitFor(() => expect(api.registerFiles).toHaveBeenCalledOnce())
    expect(api.registerFiles.mock.calls[0]![1]).toHaveLength(1)
  })

  it('keeps a full dropzone focusable and says why in text', async () => {
    await setup(photos(10))
    const button = screen.getByRole('button', { name: 'Choose photos' })
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).toHaveAccessibleDescription(/You already have 10 photos\. Remove one/)
    expect(screen.getByText('You already have 10 photos. Remove one to add another.')).toBeVisible()
  })

  it('keeps one status region from the start: loading, then the announcements', async () => {
    api.listFiles.mockReturnValue(new Promise(() => undefined))
    const first = render(<Uploader projectId="p1" onSubmitted={vi.fn()} />)
    const status = screen.getByRole('status', { name: 'Upload status' })
    expect(status).toHaveTextContent('Loading files…')
    first.unmount()
    api.listFiles.mockResolvedValue({ files: [] })
    render(<Uploader projectId="p1" onSubmitted={vi.fn()} />)
    const same = screen.getByRole('status', { name: 'Upload status' })
    await screen.findByRole('heading', { name: 'Photos' })
    expect(screen.getByRole('status', { name: 'Upload status' })).toBe(same)
    expect(same).toHaveTextContent('')
  })

  it('shows a file list only when it has files, with list semantics kept', async () => {
    await setup([serverFile('a')])
    expect(screen.getAllByRole('list')).toHaveLength(1)
    expect(screen.getByRole('list', { name: 'Photo files' })).toHaveAttribute('role', 'list')
  })

  it('does not repeat the file name in the error of an invalid file', async () => {
    await setup([serverFile('b', { status: 'invalid', error_code: 'corrupt_file' })])
    expect(document.body).not.toHaveTextContent(/b\.jpg:\s*b\.jpg/)
    expect(screen.getByText(/The file is damaged or unreadable/)).toBeInTheDocument()
  })

  it('uploads dropped files and announces it in the one status region', async () => {
    const { user, photoInput } = await setup()
    await user.upload(photoInput, jpg('hall.jpg'))
    const status = await screen.findByRole('status')
    await waitFor(() => expect(status).toHaveTextContent('1 photo uploaded'))
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.getByText(/Uploaded/)).toBeInTheDocument()
  })

  it('retries a failed upload from its card', async () => {
    api.putUpload.mockRejectedValueOnce(new PutUploadError('network_error', 'x'))
    const { user, photoInput } = await setup()
    await user.upload(photoInput, jpg('hall.jpg'))
    await user.click(await screen.findByRole('button', { name: 'Retry hall.jpg' }))
    await waitFor(() => expect(screen.getByText(/Uploaded/)).toBeInTheDocument())
    expect(api.putUpload).toHaveBeenCalledTimes(2)
  })

  it('announces a removal and moves focus to the next card', async () => {
    const { user } = await setup(photos(3))
    await user.click(screen.getByRole('button', { name: 'Remove p1.jpg' }))
    expect(screen.getByRole('status', { name: 'Upload status' })).toHaveTextContent(
      'p1.jpg removed',
    )
    await waitFor(() => expect(screen.getByRole('button', { name: 'Remove p2.jpg' })).toHaveFocus())
  })

  it('moves focus to the previous card when the last one is removed', async () => {
    const { user } = await setup(photos(2))
    await user.click(screen.getByRole('button', { name: 'Remove p2.jpg' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Remove p1.jpg' })).toHaveFocus())
  })

  it('moves focus to the dropzone button when the list becomes empty', async () => {
    const { user } = await setup([serverFile('pl', { kind: 'plan', filename: 'plan.pdf' })])
    const list = screen.getByRole('list', { name: 'Floor plan files' })
    await user.click(within(list).getByRole('button', { name: 'Remove plan.pdf' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Choose plan' })).toHaveFocus())
  })
})

const ready = () => [
  serverFile('pl', { kind: 'plan', filename: 'plan.pdf', mime: 'application/pdf' }),
  ...photos(3),
]
const job = { id: 'j1', project_id: 'p1', status: 'queued', created_at: '' }
const sendButton = () => screen.getByRole('button', { name: 'Continue to preflight' })

async function setupReady(props: { initial?: object; onSubmitted?: () => void } = {}) {
  api.listFiles.mockResolvedValue({ files: ready() })
  const onSubmitted = props.onSubmitted ?? vi.fn()
  render(<Uploader projectId="p1" onSubmitted={onSubmitted} {...props} />)
  await screen.findByRole('heading', { name: 'Photos' })
  return { user: userEvent.setup({ applyAccept: false }), onSubmitted }
}

describe('Uploader details and submit', () => {
  it('prefills the area and description of the project, with a counter', async () => {
    await setupReady({ initial: { area_m2: 85.5, description: 'Sunny flat' } })
    expect(screen.getByLabelText('Area (m²)')).toHaveValue('85.5')
    expect(screen.getByLabelText('Description')).toHaveValue('Sunny flat')
    expect(screen.getByText('10 / 2,000')).toBeInTheDocument()
  })

  it('blocks with aria-disabled and a hint, and a click does nothing', async () => {
    const { user } = await setup(photos(2))
    const button = sendButton()
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).not.toBeDisabled()
    expect(button).toHaveAccessibleDescription('Add the floor plan.')
    await user.click(button)
    expect(api.submitProject).not.toHaveBeenCalled()
  })

  it('is enabled once the files are ready', async () => {
    await setupReady()
    expect(sendButton()).not.toHaveAttribute('aria-disabled', 'true')
  })

  it('sends page 0, the area and the description once, even on a double click', async () => {
    api.submitProject.mockResolvedValue(job)
    const { user, onSubmitted } = await setupReady()
    await user.type(screen.getByLabelText('Area (m²)'), '85,5')
    await user.type(screen.getByLabelText('Description'), 'Sunny')
    await user.dblClick(sendButton())
    await waitFor(() => expect(onSubmitted).toHaveBeenCalledWith(job))
    expect(api.submitProject).toHaveBeenCalledTimes(1)
    expect(api.submitProject).toHaveBeenCalledWith(
      'p1',
      { plan_page_index: 0, area_m2: 85.5, description: 'Sunny' },
      expect.any(AbortSignal),
    )
  })

  it('sends null for an empty area and description', async () => {
    api.submitProject.mockResolvedValue(job)
    const { user } = await setupReady()
    await user.click(sendButton())
    await waitFor(() => expect(api.submitProject).toHaveBeenCalled())
    expect(api.submitProject.mock.calls[0]![1]).toEqual({
      plan_page_index: 0,
      area_m2: null,
      description: null,
    })
  })

  it('shows an inline area error, focuses the field and does not send', async () => {
    const { user } = await setupReady()
    const area = screen.getByLabelText('Area (m²)')
    await user.type(area, '-4')
    await user.click(sendButton())
    expect(area).toHaveFocus()
    expect(area).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText(/Enter a number above 0/)).toBeInTheDocument()
    expect(api.submitProject).not.toHaveBeenCalled()
    await user.clear(area)
    await user.type(area, '40')
    expect(screen.queryByText(/Enter a number above 0/)).not.toBeInTheDocument()
  })

  it('marks the files of a 422 as invalid with their message and focuses the first', async () => {
    api.submitProject.mockRejectedValue(
      new ApiRequestError(422, 'invalid_files', 'x', [
        { code: 'missing_object', message: 'm', file_id: 'p2' },
        { code: 'size_mismatch', message: 'm', file_id: 'p3' },
      ]),
    )
    const { user } = await setupReady()
    await user.click(sendButton())
    const list = await screen.findByRole('list', { name: 'Photo files' })
    expect(
      within(list).getByText('The upload did not finish. Upload the file again.'),
    ).toBeVisible()
    expect(within(list).getByText(/does not match the chosen one/)).toBeVisible()
    expect(screen.getByText('2 files need fixing')).toBeVisible()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Remove p2.jpg' })).toHaveFocus())
    expect(sendButton()).toHaveAttribute('aria-disabled', 'true')
  })

  it.each([
    [409, 'files_changed', 'The files changed while sending. Review them and try again.'],
    [409, 'project_not_editable', "This project was already sent, so its files can't be changed."],
    [503, 'enqueue_failed', 'We could not start processing. Try again in a moment.'],
  ])('shows the %i %s error and keeps the form', async (status, code, text) => {
    api.submitProject.mockRejectedValue(new ApiRequestError(status, code, 'raw'))
    const { user, onSubmitted } = await setupReady()
    await user.type(screen.getByLabelText('Description'), 'Keep me')
    await user.click(sendButton())
    expect(await screen.findByRole('alert')).toHaveTextContent(text)
    expect(screen.getByLabelText('Description')).toHaveValue('Keep me')
    expect(onSubmitted).not.toHaveBeenCalled()
    expect(sendButton()).not.toHaveAttribute('aria-disabled', 'true')
  })

  it('summarises the files that need fixing when a project comes back from the ingest', async () => {
    api.listFiles.mockResolvedValue({
      files: [
        ...ready().slice(0, 3),
        serverFile('p3', { status: 'invalid', error_code: 'corrupt_file' }),
      ],
    })
    render(<Uploader projectId="p1" onSubmitted={vi.fn()} />)
    expect(await screen.findByText('1 file needs fixing')).toBeVisible()
    expect(screen.getByText('The file is damaged or unreadable. Choose another one.')).toBeVisible()
  })
})

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
  const view = render(
    <Uploader
      projectId="p1"
      projectName="Arles bedroom"
      onSubmitted={vi.fn()}
      onNotEditable={vi.fn()}
    />,
  )
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
    render(
      <Uploader
        projectId="p1"
        projectName="Arles bedroom"
        onSubmitted={vi.fn()}
        onNotEditable={vi.fn()}
      />,
    )
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
    const first = render(
      <Uploader
        projectId="p1"
        projectName="Arles bedroom"
        onSubmitted={vi.fn()}
        onNotEditable={vi.fn()}
      />,
    )
    const status = screen.getByRole('status', { name: 'Upload status' })
    expect(status).toHaveTextContent('Loading files…')
    first.unmount()
    api.listFiles.mockResolvedValue({ files: [] })
    render(
      <Uploader
        projectId="p1"
        projectName="Arles bedroom"
        onSubmitted={vi.fn()}
        onNotEditable={vi.fn()}
      />,
    )
    const same = screen.getByRole('status', { name: 'Upload status' })
    await screen.findByRole('heading', { name: 'Photos' })
    expect(screen.getByRole('status', { name: 'Upload status' })).toBe(same)
    expect(same).toHaveTextContent('')
  })

  it('shows a file list only when it has files, with list semantics kept', async () => {
    await setup([serverFile('a')])
    expect(screen.queryByRole('list', { name: 'Floor plan files' })).not.toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Photo files' })).toHaveAttribute('role', 'list')
  })

  it('does not repeat the file name in the error of an invalid file', async () => {
    await setup([serverFile('b', { status: 'invalid', error_code: 'corrupt_file' })])
    expect(document.body).not.toHaveTextContent(/b\.jpg:\s*b\.jpg/)
    expect(screen.getByText(/The file is damaged or unreadable/)).toBeInTheDocument()
  })

  it('uploads dropped files and announces it in the upload status region', async () => {
    const { user, photoInput } = await setup()
    await user.upload(photoInput, jpg('hall.jpg'))
    const status = await screen.findByRole('status', { name: 'Upload status' })
    await waitFor(() => expect(status).toHaveTextContent('1 photo uploaded'))
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
const sendButton = () => screen.getByRole('button', { name: 'Check my files' })
const detailsToggle = () => screen.getByRole('button', { name: 'Add description' })

async function setupReady(
  props: { initial?: object; onSubmitted?: () => void; onNotEditable?: () => void } = {},
) {
  api.listFiles.mockResolvedValue({ files: ready() })
  const onSubmitted = props.onSubmitted ?? vi.fn()
  const onNotEditable = props.onNotEditable ?? vi.fn()
  render(
    <Uploader
      projectId="p1"
      projectName="Arles bedroom"
      onSubmitted={onSubmitted}
      onNotEditable={onNotEditable}
      {...props}
    />,
  )
  await screen.findByRole('heading', { name: 'Photos' })
  return { user: userEvent.setup({ applyAccept: false }), onSubmitted, onNotEditable }
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
    await user.click(detailsToggle())
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
    await user.click(detailsToggle())
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

  const status = () => screen.getByRole('status', { name: 'Upload status' })

  it('marks the files of a 422 as invalid and focuses the first one in screen order', async () => {
    // Photos are named p3 first, and p2 is first on screen among them.
    api.submitProject.mockRejectedValue(
      new ApiRequestError(422, 'invalid_files', 'x', [
        { code: 'size_mismatch', message: 'm', file_id: 'p3' },
        { code: 'missing_object', message: 'm', file_id: 'p2' },
      ]),
    )
    const { user } = await setupReady()
    await user.click(sendButton())
    const list = await screen.findByRole('list', { name: 'Photo files' })
    expect(
      within(list).getByText('The upload did not finish. Upload the file again.'),
    ).toBeVisible()
    expect(within(list).getByText(/does not match the chosen one/)).toBeVisible()
    expect(screen.getByRole('alert')).toHaveTextContent('2 files need fixing')
    // One announcement only: the alert, not the live region too.
    expect(status()).not.toHaveTextContent('need fixing')
    // Focus lands on the error text of the first card, never on Remove (Enter would delete).
    await waitFor(() => {
      const active = document.activeElement as HTMLElement
      expect(active.closest('[data-file-id]')).toHaveAttribute('data-file-id', 'p2')
      expect(active.tagName).not.toBe('BUTTON')
      expect(active).toHaveTextContent('The upload did not finish')
    })
    expect(sendButton()).toHaveAttribute('aria-disabled', 'true')
  })

  it('falls back to an alert and a reload when no refused file is on screen', async () => {
    api.submitProject.mockRejectedValue(
      new ApiRequestError(422, 'invalid_files', 'x', [
        { code: 'missing_object', message: 'm', file_id: 'ghost' },
      ]),
    )
    const { user } = await setupReady()
    await user.click(sendButton())
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Some files are not valid. Fix them and try again.',
    )
    await waitFor(() => expect(api.listFiles).toHaveBeenCalledTimes(2))
  })

  it('shows the 409 files_changed error, reloads the files and keeps the details', async () => {
    api.submitProject.mockRejectedValue(new ApiRequestError(409, 'files_changed', 'raw'))
    const { user } = await setupReady()
    await user.click(detailsToggle())
    await user.type(screen.getByLabelText('Description'), 'Keep me')
    await user.click(sendButton())
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The files changed while sending. Review them and try again.',
    )
    await waitFor(() => expect(api.listFiles).toHaveBeenCalledTimes(2))
    expect(await screen.findByLabelText('Description')).toHaveValue('Keep me')
  })

  it('asks the page to read the project again on 409 project_not_editable', async () => {
    api.submitProject.mockRejectedValue(new ApiRequestError(409, 'project_not_editable', 'raw'))
    const { user, onNotEditable } = await setupReady()
    await user.click(sendButton())
    expect(await screen.findByRole('alert')).toHaveTextContent('already sent')
    expect(onNotEditable).toHaveBeenCalledTimes(1)
  })

  it('shows the 503 enqueue_failed error and keeps the form', async () => {
    api.submitProject.mockRejectedValue(new ApiRequestError(503, 'enqueue_failed', 'raw'))
    const { user, onSubmitted } = await setupReady()
    await user.click(detailsToggle())
    await user.type(screen.getByLabelText('Description'), 'Keep me')
    await user.click(sendButton())
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We could not start processing. Try again in a moment.',
    )
    expect(screen.getByLabelText('Description')).toHaveValue('Keep me')
    expect(onSubmitted).not.toHaveBeenCalled()
    expect(sendButton()).not.toHaveAttribute('aria-disabled', 'true')
  })

  it('announces why a blocked press did nothing', async () => {
    const { user } = await setup(photos(2))
    await user.click(sendButton())
    expect(status()).toHaveTextContent('Add the floor plan.')
    expect(api.submitProject).not.toHaveBeenCalled()
  })

  it('announces that it is sending', async () => {
    api.submitProject.mockReturnValue(new Promise(() => undefined))
    const { user } = await setupReady()
    await user.click(sendButton())
    expect(status()).toHaveTextContent('Sending your files…')
  })

  it('keeps the send button out of the optional details', async () => {
    const { user } = await setupReady()
    await user.click(detailsToggle())
    const details = screen.getByRole('region', { name: 'Add optional project details' })
    expect(within(details).queryByRole('button')).not.toBeInTheDocument()
  })

  it('summarises the files that need fixing when a project comes back from the ingest', async () => {
    api.listFiles.mockResolvedValue({
      files: [
        ...ready().slice(0, 3),
        serverFile('p3', { status: 'invalid', error_code: 'corrupt_file' }),
      ],
    })
    render(
      <Uploader
        projectId="p1"
        projectName="Arles bedroom"
        onSubmitted={vi.fn()}
        onNotEditable={vi.fn()}
      />,
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('1 file needs fixing')
    expect(screen.getByText('The file is damaged or unreadable. Choose another one.')).toBeVisible()
    // The first invalid card takes the focus on its message, not on Remove.
    await waitFor(() => {
      const active = document.activeElement as HTMLElement
      expect(active.closest('[data-file-id]')).toHaveAttribute('data-file-id', 'p3')
      expect(active.tagName).not.toBe('BUTTON')
    })
  })
})

describe('Uploader layout', () => {
  it('collapses the optional details behind a button wired with aria-expanded and aria-controls', async () => {
    const { user } = await setupReady()
    const toggle = detailsToggle()
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    const panel = document.getElementById(toggle.getAttribute('aria-controls')!)!
    expect(panel).toBeInTheDocument()
    expect(screen.getByLabelText('Area (m²)')).not.toBeVisible()
    expect(screen.getByRole('heading', { name: 'Add optional project details' })).toBeVisible()

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByLabelText('Area (m²)')).toBeVisible()
    expect(screen.getByRole('region', { name: 'Add optional project details' })).toBe(panel)

    await user.type(screen.getByLabelText('Description'), 'Keep me')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByLabelText('Description')).not.toBeVisible()
    await user.click(toggle)
    expect(screen.getByLabelText('Description')).toHaveValue('Keep me')
  })

  it('starts expanded when the project already has details', async () => {
    await setupReady({ initial: { area_m2: 40, description: null } })
    expect(detailsToggle()).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByLabelText('Area (m²)')).toBeVisible()
  })

  it('expands the details to show an area error the send attempt found', async () => {
    const { user } = await setupReady()
    await user.click(detailsToggle())
    const area = screen.getByLabelText('Area (m²)')
    await user.type(area, '-4')
    await user.click(detailsToggle())
    expect(area).not.toBeVisible()
    await user.click(sendButton())
    expect(detailsToggle()).toHaveAttribute('aria-expanded', 'true')
    await waitFor(() => expect(area).toHaveFocus())
    expect(api.submitProject).not.toHaveBeenCalled()
  })

  it('counts the required sources that are in', async () => {
    const { user, planInput, photoInput } = await setup()
    expect(screen.getByText('0 of 2 required sources')).toBeInTheDocument()
    await user.upload(planInput, new File(['x'], 'plan.png', { type: 'image/png' }))
    expect(await screen.findByText('1 of 2 required sources')).toBeInTheDocument()
    await user.upload(photoInput, [jpg('a.jpg'), jpg('b.jpg'), jpg('c.jpg')])
    expect(await screen.findByText('2 of 2 required sources')).toBeInTheDocument()
  })

  it('shows the project name and the real counts in the overview', async () => {
    await setupReady()
    const card = screen.getByRole('complementary', { name: 'Project overview' })
    expect(within(card).getByText('Arles bedroom')).toBeInTheDocument()
    expect(within(card).getByText('3 of 10')).toBeInTheDocument()
  })

  it('puts the secure uploads note and the send button in the bottom bar', async () => {
    await setupReady()
    expect(screen.getByText(/Secure uploads/)).toHaveTextContent(
      'Secure uploads · PDF, PNG, JPG and WebP accepted',
    )
    expect(sendButton()).toBeVisible()
    expect(screen.getByText('All files are uploaded.')).toBeVisible()
  })
})

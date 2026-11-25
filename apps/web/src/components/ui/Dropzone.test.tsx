import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import grid from '../../assets/icons/grid-sm.svg'
import { Dropzone } from './Dropzone'

const ACCEPT = { 'image/jpeg': ['.jpg'], 'application/pdf': ['.pdf'] }
const jpg = (name = 'salon.jpg', size = 10) =>
  new File([new Uint8Array(size)], name, { type: 'image/jpeg' })

function setup(props: Partial<Parameters<typeof Dropzone>[0]> = {}) {
  const onFilesAccepted = vi.fn()
  const onFilesRejected = vi.fn()
  const view = render(
    <Dropzone
      title="Photos"
      help="JPG, PNG up to 12 MB"
      buttonLabel="Choose media"
      icon={grid}
      accept={ACCEPT}
      maxSize={100}
      maxFiles={2}
      onFilesAccepted={onFilesAccepted}
      onFilesRejected={onFilesRejected}
      {...props}
    />,
  )
  const input = view.container.querySelector('input[type=file]') as HTMLInputElement
  return { onFilesAccepted, onFilesRejected, input, view }
}

const drag = (target: Element, files: File[]) =>
  fireEvent.dragEnter(target, {
    dataTransfer: {
      files,
      items: files.map((f) => ({ kind: 'file', type: f.type })),
      types: ['Files'],
    },
  })

describe('Dropzone', () => {
  it('shows title and limits as text, with the button as the only tab stop', async () => {
    setup()
    expect(screen.getByText('Photos')).toBeInTheDocument()
    expect(screen.getByText('JPG, PNG up to 12 MB')).toBeInTheDocument()
    const user = userEvent.setup()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Choose media' })).toHaveFocus()
    await user.tab()
    expect(document.body).toHaveFocus()
  })

  it('opens the file dialog from the button', async () => {
    const { input } = setup()
    const click = vi.spyOn(input, 'click')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Choose media' }))
    expect(click).toHaveBeenCalled()
  })

  it('reports accepted files', async () => {
    const { input, onFilesAccepted, onFilesRejected } = setup()
    const file = jpg()
    await userEvent.setup().upload(input, file)
    await waitFor(() => expect(onFilesAccepted).toHaveBeenCalledWith([file]))
    expect(onFilesRejected).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it.each([
    ['too big', jpg('big.jpg', 500), 'big.jpg is too large. The maximum is 100 B.'],
    [
      'wrong type',
      new File(['x'], 'plan.heic', { type: 'image/heic' }),
      'plan.heic is not a supported file type.',
    ],
  ])('rejects a file that is %s with a message that says why', async (_n, file, message) => {
    const { input, onFilesRejected } = setup()
    fireEvent.change(input, { target: { files: [file] } })
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(onFilesRejected).toHaveBeenCalledOnce()
  })

  it('rejects more files than maxFiles', async () => {
    const { input } = setup()
    fireEvent.change(input, { target: { files: [jpg('a.jpg'), jpg('b.jpg'), jpg('c.jpg')] } })
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many files. The maximum is 2.')
  })

  it('says "Drop to upload" in text while dragging, and clears it on leave', async () => {
    const { view } = setup()
    const root = view.container.firstElementChild!
    drag(root, [jpg()])
    expect(await screen.findByText('Drop to upload')).toBeInTheDocument()
    fireEvent.dragLeave(root)
    await waitFor(() => expect(screen.queryByText('Drop to upload')).not.toBeInTheDocument())
  })

  it('says a dragged file will be rejected', async () => {
    const { view } = setup()
    drag(view.container.firstElementChild!, [new File(['x'], 'a.heic', { type: 'image/heic' })])
    expect(await screen.findByText('This file type is not supported')).toBeInTheDocument()
  })

  it('disables the button when disabled', () => {
    setup({ disabled: true })
    expect(screen.getByRole('button', { name: 'Choose media' })).toBeDisabled()
  })
})

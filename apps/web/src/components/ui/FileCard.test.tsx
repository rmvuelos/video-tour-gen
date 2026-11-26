import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FileCard } from './FileCard'

const file = { name: 'salon.jpg', size: 13_002_342, type: 'image/jpeg' }
const base = { file, onRemove: () => {} }

describe('FileCard', () => {
  it('shows a truncated name with its full title, and a readable size', () => {
    render(<FileCard {...base} status="pending" />)
    expect(screen.getByText('salon.jpg')).toHaveAttribute('title', 'salon.jpg')
    expect(screen.getByText(/12\.4 MB/)).toBeInTheDocument()
    expect(screen.getByText(/Waiting to upload/)).toBeInTheDocument()
  })

  it('shows the thumbnail as decoration, or a file icon without one', () => {
    const { container, rerender } = render(<FileCard {...base} status="pending" preview="blob:x" />)
    expect(container.querySelector('img')).toHaveAttribute('alt', '')
    rerender(<FileCard {...base} status="pending" />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('[data-icon]')).toBeInTheDocument()
  })

  it('names the remove button after the file', async () => {
    const onRemove = vi.fn()
    render(<FileCard {...base} status="uploaded" onRemove={onRemove} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Remove salon.jpg' }))
    expect(onRemove).toHaveBeenCalledOnce()
    expect(screen.getByText(/Uploaded/)).toBeInTheDocument()
  })

  it('shows upload progress as a named progress bar with the percentage in text', () => {
    render(<FileCard {...base} status="uploading" progress={42} />)
    expect(screen.getByRole('progressbar', { name: 'Uploading salon.jpg' })).toHaveAttribute(
      'aria-valuenow',
      '42',
    )
    expect(screen.getByText(/42%/)).toBeInTheDocument()
  })

  it('shows what failed in text with the file name, without interrupting', async () => {
    const onClick = vi.fn()
    render(
      <FileCard
        {...base}
        status="error"
        error="Upload failed. Check your connection."
        action={{ label: 'Retry', onClick }}
      />,
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText(/Upload failed/)).toHaveTextContent('salon.jpg: Upload failed.')
    const retry = screen.getByRole('button', { name: 'Retry salon.jpg' })
    expect(retry).toHaveAccessibleDescription('salon.jpg: Upload failed. Check your connection.')
    await userEvent.setup().click(retry)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it.each([
    [41.6, '42%'],
    [150, '100%'],
    [-3, '0%'],
  ])('shows progress %s as %s', (progress, text) => {
    render(<FileCard {...base} status="uploading" progress={progress} />)
    expect(screen.getByText(new RegExp(`Uploading ${text}`))).toBeInTheDocument()
  })

  it('requires the message of an error', () => {
    // @ts-expect-error an error card needs `error`
    render(<FileCard {...base} status="error" />)
  })

  describe('with a File and no preview', () => {
    const created = vi.fn(() => 'blob:own')
    const revoked = vi.fn()
    beforeEach(() => {
      Object.assign(URL, { createObjectURL: created, revokeObjectURL: revoked })
      created.mockClear()
      revoked.mockClear()
    })

    it('creates its own thumbnail URL and revokes it on unmount', () => {
      const photo = new File(['x'], 'salon.jpg', { type: 'image/jpeg' })
      const { container, unmount } = render(
        <FileCard file={photo} onRemove={() => {}} status="pending" />,
      )
      expect(container.querySelector('img')).toHaveAttribute('src', 'blob:own')
      unmount()
      expect(revoked).toHaveBeenCalledWith('blob:own')
    })

    it('leaves a caller-owned preview alone', () => {
      const photo = new File(['x'], 'salon.jpg', { type: 'image/jpeg' })
      const { unmount } = render(
        <FileCard file={photo} preview="blob:mine" onRemove={() => {}} status="pending" />,
      )
      unmount()
      expect(created).not.toHaveBeenCalled()
      expect(revoked).not.toHaveBeenCalled()
    })
  })

  it('separates size and status with a hidden dot, not a broken character', () => {
    const { container } = render(<FileCard {...base} status="pending" />)
    expect(container).not.toHaveTextContent('�')
    expect(screen.getByText('·')).toHaveAttribute('aria-hidden', 'true')
  })

  it('describes the remove button with the error message too', () => {
    render(<FileCard {...base} status="error" error="Could not reach the server." />)
    const remove = screen.getByRole('button', { name: 'Remove salon.jpg' })
    expect(remove).toHaveAccessibleDescription(/Could not reach the server\./)
  })
})

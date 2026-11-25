import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
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

  it('shows what failed and offers the action', async () => {
    const onClick = vi.fn()
    render(
      <FileCard
        {...base}
        status="error"
        error="Upload failed. Check your connection."
        action={{ label: 'Retry', onClick }}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Upload failed. Check your connection.')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }))
    expect(onClick).toHaveBeenCalledOnce()
  })
})

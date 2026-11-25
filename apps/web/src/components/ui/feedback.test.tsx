import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Alert } from './Alert'
import { ProgressBar } from './ProgressBar'

describe('Alert', () => {
  it('interrupts assistive technology only for errors', () => {
    render(<Alert tone="error">Upload failed</Alert>)
    expect(screen.getByRole('alert')).toHaveTextContent('Upload failed')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it.each(['info', 'success'] as const)('announces %s politely', (tone) => {
    render(<Alert tone={tone}>Saved</Alert>)
    expect(screen.getByRole('status')).toHaveTextContent('Saved')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('states the tone in text and hides the icon', () => {
    render(<Alert tone="error">Upload failed</Alert>)
    expect(screen.getByText('Error:')).toBeInTheDocument()
    expect(screen.getByRole('alert').querySelector('[data-icon]')).toHaveAttribute(
      'aria-hidden',
      'true',
    )
  })

  it('runs the optional action', async () => {
    const onClick = vi.fn()
    render(
      <Alert tone="error" action={{ label: 'Retry', onClick }}>
        Upload failed
      </Alert>,
    )
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('has no button without an action', () => {
    render(<Alert tone="info">Tip</Alert>)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

describe('ProgressBar', () => {
  it('exposes value, range and name', () => {
    render(<ProgressBar label="Uploading salon.jpg" value={40} />)
    const bar = screen.getByRole('progressbar', { name: 'Uploading salon.jpg' })
    expect(bar).toHaveAttribute('aria-valuenow', '40')
    expect(bar).toHaveAttribute('aria-valuemin', '0')
    expect(bar).toHaveAttribute('aria-valuemax', '100')
  })

  it.each([
    [-5, '0'],
    [250, '100'],
  ])('clamps %s to %s', (value, expected) => {
    render(<ProgressBar label="Uploading" value={value} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', expected)
  })

  it('is indeterminate without a value: no valuenow and no motion under reduced motion', () => {
    render(<ProgressBar label="Preparing" />)
    const bar = screen.getByRole('progressbar', { name: 'Preparing' })
    expect(bar).not.toHaveAttribute('aria-valuenow')
    expect(bar.firstElementChild).toHaveClass('motion-reduce:animate-none')
  })

  it('can be named by another element', () => {
    render(
      <>
        <span id="n">Floor plan</span>
        <ProgressBar labelledBy="n" value={10} />
      </>,
    )
    expect(screen.getByRole('progressbar', { name: 'Floor plan' })).toBeInTheDocument()
  })
})

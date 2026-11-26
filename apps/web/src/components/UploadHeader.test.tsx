import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { UploadHeader } from './UploadHeader'

describe('UploadHeader', () => {
  it('marks the upload step as the current one in the stepper', () => {
    render(<UploadHeader />)
    const steps = within(screen.getByRole('list', { name: 'Progress' })).getAllByRole('listitem')
    expect(steps).toHaveLength(3)
    expect(steps[0]).toHaveAttribute('aria-current', 'step')
    expect(steps[0]).toHaveTextContent('Upload assets')
    expect(steps[1]).not.toHaveAttribute('aria-current')
    expect(steps[2]).toHaveTextContent('Generate & export')
  })

  it('shows the phase, the headline and the subtitle', () => {
    render(<UploadHeader />)
    expect(screen.getByText('Phase 01 / 03')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByText('Phase 1 of 3')).toHaveClass('sr-only')
    expect(screen.getByText('Every room begins with a story.')).toBeInTheDocument()
    expect(
      screen.getByText(
        "Bring a blueprint, photographs and a few ideas together. We'll build the spatial foundation.",
      ),
    ).toBeInTheDocument()
  })

  it('keeps the page heading for the project name, not for the tagline', () => {
    render(<UploadHeader />)
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })
})

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Avatar } from './Avatar'
import { Button } from './Button'
import { Card } from './Card'
import { Eyebrow } from './Eyebrow'

describe('Button', () => {
  it('is a non-submitting button by default', () => {
    render(<Button>Browse files</Button>)
    expect(screen.getByRole('button', { name: 'Browse files' })).toHaveAttribute('type', 'button')
  })

  it('calls onClick and is reachable with the keyboard', async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()
    render(<Button onClick={onClick}>Choose media</Button>)
    await user.tab()
    expect(screen.getByRole('button')).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('does not fire when disabled and cannot take focus', async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()
    render(
      <Button disabled onClick={onClick}>
        Add description
      </Button>,
    )
    await user.click(screen.getByRole('button'))
    await user.tab()
    expect(onClick).not.toHaveBeenCalled()
    expect(screen.getByRole('button')).toBeDisabled()
    expect(screen.getByRole('button')).not.toHaveFocus()
  })

  it('renders each variant with a distinct style', () => {
    render(
      <>
        <Button variant="primary">a</Button>
        <Button variant="secondary">b</Button>
        <Button variant="cta">c</Button>
      </>,
    )
    const classes = screen.getAllByRole('button').map((b) => b.className)
    expect(new Set(classes).size).toBe(3)
  })

  it('shows a decorative arrow only on the cta variant', () => {
    const { container, rerender } = render(<Button variant="cta">Continue to preflight</Button>)
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull()
    rerender(<Button>Continue to preflight</Button>)
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull()
  })
})

describe('Eyebrow', () => {
  it('renders its text with the uppercase style', () => {
    render(<Eyebrow>Phase 01 / 03</Eyebrow>)
    expect(screen.getByText('Phase 01 / 03')).toHaveClass('uppercase')
  })

  it('uses a different color for the accent tone', () => {
    render(
      <>
        <Eyebrow>muted</Eyebrow>
        <Eyebrow tone="accent">accent</Eyebrow>
      </>,
    )
    expect(screen.getByText('muted').className).not.toBe(screen.getByText('accent').className)
  })
})

describe('Card', () => {
  it('renders children and merges a custom class', () => {
    render(<Card className="p-card">Body</Card>)
    expect(screen.getByText('Body')).toHaveClass('p-card', 'bg-surface')
  })
})

describe('Avatar', () => {
  it('shows the initials as text', () => {
    render(<Avatar initials="AM" />)
    expect(screen.getByText('AM')).toBeInTheDocument()
  })

  it('exposes an accessible name when a label is given', () => {
    render(<Avatar initials="AM" label="Adri M." variant="solid" />)
    expect(screen.getByRole('img', { name: 'Adri M.' })).toBeInTheDocument()
  })
})

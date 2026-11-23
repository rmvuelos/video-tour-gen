import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Avatar } from './Avatar'
import { Button } from './Button'
import { Card } from './Card'
import { Eyebrow } from './Eyebrow'

describe('Button', () => {
  it('does not submit a surrounding form by default', async () => {
    const onSubmit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault())
    render(
      <form onSubmit={onSubmit}>
        <Button>Browse files</Button>
      </form>,
    )
    await userEvent.setup().click(screen.getByRole('button', { name: 'Browse files' }))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits the form when type="submit" is explicit', async () => {
    const onSubmit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault())
    render(
      <form onSubmit={onSubmit}>
        <Button type="submit">Continue</Button>
      </form>,
    )
    await userEvent.setup().click(screen.getByRole('button', { name: 'Continue' }))
    expect(onSubmit).toHaveBeenCalledOnce()
  })

  it('calls onClick and is reachable and activatable with the keyboard', async () => {
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

  it('points the ref at the button element', () => {
    const ref = createRef<HTMLButtonElement>()
    render(<Button ref={ref}>Browse files</Button>)
    expect(ref.current).toBe(screen.getByRole('button'))
  })

  it('forwards aria and data attributes', () => {
    render(
      <Button aria-label="Upload a floor plan" data-testid="upload">
        Browse files
      </Button>,
    )
    expect(screen.getByRole('button', { name: 'Upload a floor plan' })).toHaveAttribute(
      'data-testid',
      'upload',
    )
  })

  it('keeps the accessible name of the cta variant free of its decorative arrow', () => {
    render(<Button variant="cta">Continue to preflight</Button>)
    expect(screen.getByRole('button', { name: 'Continue to preflight' })).toBeInTheDocument()
  })
})

describe('Eyebrow', () => {
  it('renders its text and forwards native props', () => {
    render(
      <Eyebrow id="phase" tone="accent">
        Phase 01 / 03
      </Eyebrow>,
    )
    expect(screen.getByText('Phase 01 / 03')).toHaveAttribute('id', 'phase')
  })
})

describe('Card', () => {
  it('renders children and forwards native props', () => {
    render(<Card aria-label="Project summary">Body</Card>)
    expect(screen.getByLabelText('Project summary')).toHaveTextContent('Body')
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

  it('forwards native props and a custom class', () => {
    render(<Avatar initials="AM" data-testid="me" className="ml-2" />)
    expect(screen.getByTestId('me')).toHaveClass('ml-2')
  })
})

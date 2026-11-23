import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Breadcrumb } from './Breadcrumb'
import { Checklist } from './Checklist'
import { SaveStatus } from './SaveStatus'
import { Stepper } from './Stepper'

describe('Breadcrumb', () => {
  const items = [
    { label: 'Workspace', href: '/' },
    { label: 'Projects', href: '/p' },
    { label: 'Arles bedroom' },
  ]

  it('is a labelled nav with an ordered list and the last item as the current page', () => {
    render(<Breadcrumb items={items} />)
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(nav).getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByRole('link', { name: 'Projects' })).toHaveAttribute('href', '/p')
    expect(screen.getByText('Arles bedroom')).toHaveAttribute('aria-current', 'page')
    expect(screen.queryByRole('link', { name: 'Arles bedroom' })).not.toBeInTheDocument()
  })

  it('hides the separators from assistive technology', () => {
    const { container } = render(<Breadcrumb items={items} />)
    const separators = container.querySelectorAll('[data-separator]')
    expect(separators).toHaveLength(2)
    separators.forEach((s) => expect(s).toHaveAttribute('aria-hidden', 'true'))
  })
})

describe('Stepper', () => {
  const steps = ['Upload assets', 'AI preflight', 'Generate & export']

  it('marks the current step and states every step in text, not only color', () => {
    render(<Stepper steps={steps} current={1} />)
    const [done, current, pending] = screen.getAllByRole('listitem')
    expect(done).toHaveTextContent('Upload assets, completed')
    expect(current).toHaveAttribute('aria-current', 'step')
    expect(current).toHaveTextContent('AI preflight, current step')
    expect(pending).not.toHaveAttribute('aria-current')
    expect(pending).toHaveTextContent('Generate & export, not started')
  })

  it('is an ordered list', () => {
    render(<Stepper steps={steps} current={0} />)
    expect(screen.getByRole('list').tagName).toBe('OL')
  })
})

describe('SaveStatus', () => {
  it('is a polite live region that announces each state change', () => {
    const { rerender } = render(<SaveStatus status="saved" />)
    const region = screen.getByRole('status')
    expect(region).toHaveTextContent('All changes saved')
    rerender(<SaveStatus status="saving" />)
    expect(screen.getByRole('status')).toBe(region)
    expect(region).toHaveTextContent('Saving changes')
    rerender(<SaveStatus status="error" />)
    expect(region).toHaveTextContent('Could not save changes')
  })

  it('keeps the dot decorative', () => {
    const { container } = render(<SaveStatus status="saved" />)
    expect(container.querySelector('[data-dot]')).toHaveAttribute('aria-hidden', 'true')
  })
})

describe('Checklist', () => {
  it('is a labelled list that states done or missing in text', () => {
    render(
      <Checklist
        title="Required inputs"
        items={[
          { label: 'Blueprint / sketch', done: true },
          { label: 'Photo references', done: false },
        ]}
      />,
    )
    const list = screen.getByRole('list', { name: 'Required inputs' })
    const [first, second] = within(list).getAllByRole('listitem')
    expect(first).toHaveTextContent('Blueprint / sketch, done')
    expect(second).toHaveTextContent('Photo references, missing')
  })
})

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
    render(<Breadcrumb items={items} />)
    const separators = screen.getAllByText('/')
    expect(separators).toHaveLength(2)
    separators.forEach((s) => expect(s).toHaveAttribute('aria-hidden', 'true'))
  })

  it('keeps the full label in a title when the current page is truncated', () => {
    render(<Breadcrumb items={items} />)
    expect(screen.getByText('Arles bedroom')).toHaveAttribute('title', 'Arles bedroom')
  })
})

describe('Stepper', () => {
  const steps = ['Upload assets', 'AI preflight', 'Generate & export']

  it('marks the current step and states every step in text, not only color', () => {
    render(<Stepper steps={steps} current={1} />)
    const [done, current, pending] = screen.getAllByRole('listitem')
    expect(done).toHaveTextContent('Upload assets, completed')
    expect(current).toHaveAttribute('aria-current', 'step')
    expect(current).toHaveTextContent(/^AI preflight$/)
    expect(pending).not.toHaveAttribute('aria-current')
    expect(pending).toHaveTextContent('Generate & export, not started')
  })

  it('is a labelled ordered list', () => {
    render(<Stepper steps={steps} current={0} />)
    expect(screen.getByRole('list', { name: 'Progress' }).tagName).toBe('OL')
  })
})

describe('SaveStatus', () => {
  it('announces saved politely and keeps the status region mounted', () => {
    const { rerender } = render(<SaveStatus status="saving" />)
    const region = screen.getByRole('status')
    expect(region).toBeEmptyDOMElement()
    rerender(<SaveStatus status="saved" />)
    expect(screen.getByRole('status')).toBe(region)
    expect(region).toHaveTextContent('All changes saved')
  })

  it('does not announce saving but still shows it', () => {
    render(<SaveStatus status="saving" />)
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    expect(screen.getByRole('alert')).toBeEmptyDOMElement()
    expect(screen.getByText('Saving changes')).toBeVisible()
  })

  it('announces an error assertively through its own alert node', () => {
    const { rerender } = render(<SaveStatus status="saved" />)
    const alert = screen.getByRole('alert')
    expect(alert).toBeEmptyDOMElement()
    rerender(<SaveStatus status="error" />)
    expect(screen.getByRole('alert')).toBe(alert)
    expect(alert).toHaveTextContent('Could not save changes')
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
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

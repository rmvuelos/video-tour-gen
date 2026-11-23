import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Sidebar } from './Sidebar'

const HREFS = { upload: '/upload', projects: '/projects' }
const USER = { name: 'Adri M.', initials: 'AM' }
const DISABLED = ['AI preflight', '3D generation', 'Templates', 'Preferences']

function setup(current: 'upload' | 'projects' = 'upload') {
  const onNavigate = vi.fn((_id: string, e: { preventDefault: () => void }) => e.preventDefault())
  render(<Sidebar current={current} hrefs={HREFS} user={USER} onNavigate={onNavigate} />)
  return { onNavigate, user: userEvent.setup() }
}

describe('Sidebar', () => {
  it('has a labelled nav with the Create and Library lists', () => {
    setup()
    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(within(nav).getByRole('list', { name: 'Create' })).toBeInTheDocument()
    expect(within(nav).getByRole('list', { name: 'Library' })).toBeInTheDocument()
    expect(screen.getByText('rooma.')).toBeInTheDocument()
    expect(screen.getByText('Personal workspace')).toBeInTheDocument()
  })

  it('marks only the current section with aria-current and lets both live links navigate', async () => {
    const { onNavigate, user } = setup('upload')
    const upload = screen.getByRole('link', { name: /Upload assets/ })
    const projects = screen.getByRole('link', { name: 'My projects' })
    expect(upload).toHaveAttribute('aria-current', 'page')
    expect(upload).toHaveAttribute('href', '/upload')
    expect(projects).not.toHaveAttribute('aria-current')
    await user.click(projects)
    expect(onNavigate).toHaveBeenCalledWith('projects', expect.anything())
  })

  it('moves aria-current to My projects', () => {
    setup('projects')
    expect(screen.getByRole('link', { name: 'My projects' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('link', { name: /Upload assets/ })).not.toHaveAttribute('aria-current')
  })

  it.each(DISABLED)(
    '%s is aria-disabled, not a link, and does nothing when activated',
    async (name) => {
      const { onNavigate, user } = setup()
      const item = screen.getByRole('button', { name: new RegExp(name) })
      expect(item).toHaveAttribute('aria-disabled', 'true')
      expect(screen.queryByRole('link', { name: new RegExp(name) })).not.toBeInTheDocument()
      await user.click(item)
      item.focus()
      await user.keyboard('{Enter} ')
      expect(onNavigate).not.toHaveBeenCalled()
    },
  )
})

describe('Coming soon tooltip', () => {
  const item = () => screen.getByRole('button', { name: /Templates/ })
  const tooltip = () => document.getElementById(item().getAttribute('aria-describedby')!)!

  it('is described by the item and hidden until hover or focus', () => {
    setup()
    expect(item()).toHaveAccessibleDescription('Coming soon')
    expect(tooltip()).not.toBeVisible()
  })

  it('shows on hover and stays while the pointer is over the tooltip', async () => {
    const { user } = setup()
    await user.hover(item())
    expect(tooltip()).toBeVisible()
    await user.hover(tooltip())
    expect(tooltip()).toBeVisible()
    await user.unhover(tooltip())
    expect(tooltip()).not.toBeVisible()
  })

  it('shows on keyboard focus and Escape dismisses it', async () => {
    const { user } = setup()
    act(() => item().focus())
    expect(tooltip()).toBeVisible()
    await user.keyboard('{Escape}')
    expect(tooltip()).not.toBeVisible()
  })

  it('Escape dismisses a tooltip opened by hover alone, without focus', async () => {
    const { user } = setup()
    await user.hover(item())
    expect(item()).not.toHaveFocus()
    expect(tooltip()).toBeVisible()
    await user.keyboard('{Escape}')
    expect(tooltip()).not.toBeVisible()
  })

  it('stays visible while focus remains after the pointer leaves', async () => {
    const { user } = setup()
    act(() => item().focus())
    await user.hover(item())
    await user.unhover(item())
    expect(tooltip()).toBeVisible()
  })
})

describe('Plan card and decorative parts', () => {
  it('shows the plan as plain text: not a button, not focusable', () => {
    setup()
    expect(screen.getByText('Studio / Free')).toBeVisible()
    expect(screen.queryByRole('button', { name: /Your plan/ })).not.toBeInTheDocument()
  })

  it('hides the step numbers and the avatar initials from assistive technology', () => {
    setup()
    expect(screen.getByRole('link', { name: 'Upload assets' })).toBeInTheDocument()
    expect(screen.getByText('AM')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByText('01')).toHaveAttribute('aria-hidden', 'true')
  })
})

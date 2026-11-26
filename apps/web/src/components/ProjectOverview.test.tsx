import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { sourceProgress } from '../lib/upload-rules'
import { ProjectOverview } from './ProjectOverview'

const progress = (plan: number, photos: number): ReturnType<typeof sourceProgress> => ({
  plan: { count: plan, max: 1, met: plan === 1 },
  photos: { count: photos, min: 3, max: 10, met: photos >= 3 },
  met: Number(plan === 1) + Number(photos >= 3),
  total: 2,
})

describe('ProjectOverview', () => {
  it('shows the project name and a decorative illustration', () => {
    const { container } = render(<ProjectOverview name="Arles bedroom" progress={progress(0, 0)} />)
    const card = screen.getByRole('complementary', { name: 'Project overview' })
    expect(within(card).getByText('Arles bedroom')).toBeInTheDocument()
    expect(within(card).getByText('Illustrative floor plan')).toBeInTheDocument()
    expect(container.querySelector('img')).toHaveAttribute('alt', '')
  })

  it('lists the required inputs with the real counts and a text state for each', () => {
    render(<ProjectOverview name="Loft" progress={progress(1, 2)} />)
    const list = screen.getByRole('list', { name: 'Required inputs' })
    const [plan, photos] = within(list).getAllByRole('listitem')
    expect(plan).toHaveTextContent('Blueprint / sketch')
    expect(plan).toHaveTextContent('1 of 1')
    expect(plan).toHaveTextContent('added')
    expect(photos).toHaveTextContent('Photo references')
    expect(photos).toHaveTextContent('2 of 10')
    expect(photos).toHaveTextContent('needs at least 3')
  })

  it('marks both inputs as added once the sources are met', () => {
    render(<ProjectOverview name="Loft" progress={progress(1, 5)} />)
    const items = within(screen.getByRole('list', { name: 'Required inputs' })).getAllByRole(
      'listitem',
    )
    expect(items[0]).toHaveTextContent('added')
    expect(items[1]).toHaveTextContent('added')
  })

  it('keeps only the privacy note that is true', () => {
    render(<ProjectOverview name="Loft" progress={progress(0, 0)} />)
    expect(screen.getByText('Private workspace')).toBeInTheDocument()
    expect(screen.queryByText(/autosaved/i)).not.toBeInTheDocument()
  })
})

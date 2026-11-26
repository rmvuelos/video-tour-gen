import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { PageTitle } from './PageTitle'

it('renders the page h1 and takes focus when it appears, so screen readers announce the page', () => {
  render(<PageTitle className="x">My page</PageTitle>)
  const heading = screen.getByRole('heading', { level: 1, name: 'My page' })
  expect(heading).toHaveFocus()
  expect(heading).toHaveAttribute('tabindex', '-1')
  expect(heading).toHaveClass('x')
})

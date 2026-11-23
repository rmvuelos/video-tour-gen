import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from './App'

describe('App', () => {
  it('renders the rooma name as the main heading', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'rooma' })).toBeInTheDocument()
  })
})

describe('App /dev/ui', () => {
  it('shows the primitives gallery on the dev route', async () => {
    window.history.pushState({}, '', '/dev/ui')
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'UI primitives' })).toBeInTheDocument()
    window.history.pushState({}, '', '/')
  })
})

import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { App } from './App'

afterEach(() => window.history.pushState({}, '', '/'))

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
  })

  it('exposes each gallery section as a named region', async () => {
    window.history.pushState({}, '', '/dev/ui')
    render(<App />)
    expect(await screen.findByRole('region', { name: 'Button' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Semantic colors' })).toBeInTheDocument()
  })
})

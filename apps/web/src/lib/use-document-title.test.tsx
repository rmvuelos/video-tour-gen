import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useDocumentTitle } from './use-document-title'

function Page({ title }: { title: string }) {
  useDocumentTitle(title)
  return null
}

describe('useDocumentTitle', () => {
  it('sets the title with the app name and follows changes', () => {
    const { rerender } = render(<Page title="Sign in" />)
    expect(document.title).toBe('Sign in · rooma')
    rerender(<Page title="Create account" />)
    expect(document.title).toBe('Create account · rooma')
  })
})

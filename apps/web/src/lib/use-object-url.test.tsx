import { renderHook } from '@testing-library/react'
import { StrictMode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useObjectUrl } from './use-object-url'

describe('useObjectUrl', () => {
  let n = 0
  const create = vi.spyOn(URL, 'createObjectURL')
  const revoke = vi.spyOn(URL, 'revokeObjectURL')
  beforeEach(() => {
    n = 0
    Object.assign(URL, { createObjectURL: () => '', revokeObjectURL: () => {} })
    create.mockImplementation(() => `blob:${++n}`)
    revoke.mockReset()
    create.mockClear()
  })

  const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' })

  it('returns nothing without a file', () => {
    const { result } = renderHook(() => useObjectUrl(undefined))
    expect(result.current).toBeUndefined()
    expect(create).not.toHaveBeenCalled()
  })

  it('creates a URL and revokes it on unmount', () => {
    const { result, unmount } = renderHook(() => useObjectUrl(file))
    expect(result.current).toBe('blob:1')
    unmount()
    expect(revoke).toHaveBeenCalledWith('blob:1')
  })

  it('revokes the previous URL when the file changes', () => {
    const other = new File(['y'], 'b.jpg', { type: 'image/jpeg' })
    const { result, rerender } = renderHook(({ f }) => useObjectUrl(f), {
      initialProps: { f: file },
    })
    rerender({ f: other })
    expect(revoke).toHaveBeenCalledWith('blob:1')
    expect(result.current).toBe('blob:2')
  })

  it('does not leak under StrictMode double effects', () => {
    const { result, unmount } = renderHook(() => useObjectUrl(file), { wrapper: StrictMode })
    const live = result.current
    expect(revoke).not.toHaveBeenCalledWith(live)
    unmount()
    expect(revoke.mock.calls.map(([u]) => u).sort()).toEqual(
      create.mock.results.map((r) => r.value).sort(),
    )
  })
})

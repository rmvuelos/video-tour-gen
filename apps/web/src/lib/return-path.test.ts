import { describe, expect, it } from 'vitest'
import { safeReturnPath } from './return-path'

describe('safeReturnPath', () => {
  it.each(['/projects', '/a?b=1#c', '/'])('keeps the internal path %s', (path) => {
    expect(safeReturnPath(path)).toBe(path)
  })

  it.each([
    '//evil.test',
    '/\\evil.test',
    'https://evil.test',
    'javascript:alert(1)',
    'projects',
    '',
    undefined,
    null,
    42,
    { pathname: '/x' },
  ])('falls back to / for %j', (value) => {
    expect(safeReturnPath(value)).toBe('/')
  })
})

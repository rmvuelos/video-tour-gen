import { expect, it } from 'vitest'
import { formatBytes } from './format-bytes'

it.each([
  [0, '0 B'],
  [1023, '1023 B'],
  [12_582_912, '12 MB'],
  [13_002_342, '12.4 MB'],
  [20 * 1024 ** 3, '20 GB'],
])('formats %s as %s', (bytes, text) => {
  expect(formatBytes(bytes)).toBe(text)
})

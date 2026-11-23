import { describe, expect, it } from 'vitest'
import css from './index.css?raw'

const tokens = new Map(
  [...css.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2]!.trim()]),
)

function resolve(name: string): string {
  const value = tokens.get(name)
  if (value === undefined) throw new Error(`Missing token --${name}`)
  const ref = /^var\(--([\w-]+)\)$/.exec(value)
  return ref ? resolve(ref[1]!) : value
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(fg: string, bg: string): number {
  const [hi, lo] = [luminance(resolve(fg)), luminance(resolve(bg))].sort((a, b) => b - a)
  return (hi! + 0.05) / (lo! + 0.05)
}

// Text pairs used by the Figma frames (WCAG AA: 4.5:1 normal text).
const TEXT_PAIRS: [string, string][] = [
  ['color-fg', 'color-canvas'],
  ['color-fg', 'color-surface'],
  ['color-fg', 'color-control'],
  ['color-fg', 'color-avatar'],
  ['color-fg-on-action', 'color-action'],
  ['color-fg-on-action', 'color-action-hover'],
  ['color-fg-muted', 'color-canvas'],
  ['color-fg-muted', 'color-surface'],
  ['color-fg-muted', 'color-surface-subtle'],
  ['color-fg-accent', 'color-canvas'],
  ['color-fg-accent', 'color-surface'],
  ['color-fg-accent', 'color-surface-subtle'],
  ['color-fg-accent', 'color-selected'],
]

describe('color tokens', () => {
  it.each(TEXT_PAIRS)('%s on %s reaches WCAG AA for text', (fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5)
  })

  it.each([['color-success'], ['color-icon-muted'], ['color-accent'], ['color-focus']])(
    '%s reaches 3:1 on the canvas (graphics and focus ring)',
    (fg) => {
      expect(contrast(fg, 'color-canvas')).toBeGreaterThanOrEqual(3)
    },
  )
})

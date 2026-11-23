import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Read as text: vitest stubs imported CSS files with an empty string.
const css = readFileSync('src/index.css', 'utf8')
const tokens = new Map(
  [...css.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2]!.trim()]),
)

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))

/** Resolves a token to #rrggbb, following var() and `color-mix(in srgb, var(--a) N%, var(--b))`. */
function resolve(name: string): string {
  const value = tokens.get(name)
  if (value === undefined) throw new Error(`Missing token --${name}`)
  const ref = /^var\(--([\w-]+)\)$/.exec(value)
  if (ref) return resolve(ref[1]!)
  const mix = /^color-mix\(in srgb, var\(--([\w-]+)\) (\d+)%, var\(--([\w-]+)\)\)$/.exec(value)
  if (!mix) return value
  const [a, b, p] = [rgb(resolve(mix[1]!)), rgb(resolve(mix[3]!)), Number(mix[2]) / 100]
  return (
    '#' +
    a
      .map((v, i) =>
        Math.round(v * p + b[i]! * (1 - p))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  )
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
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
  ['color-fg', 'color-control-hover'],
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

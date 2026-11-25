// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Node environment (import.meta.url must be a file URL); read as text because vitest stubs CSS imports.
const css = readFileSync(new URL('./index.css', import.meta.url), 'utf8')
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

// Every semantic text color against every semantic surface it can sit on (WCAG AA, 4.5:1).
// Exceptions are documented in index.css: fg-accent is not used on these surfaces.
const TEXT_COLORS = ['color-fg', 'color-fg-muted', 'color-fg-accent']
const SURFACES = [
  'color-canvas',
  'color-surface',
  'color-surface-subtle',
  'color-selected',
  'color-tile',
  'color-control',
  'color-control-hover',
  'color-avatar',
  'color-step-idle',
]
const NOT_USED_ON: Record<string, string[]> = {
  'color-fg-accent': ['color-control-hover', 'color-avatar', 'color-step-idle'],
}
const TEXT_PAIRS = TEXT_COLORS.flatMap((fg) =>
  SURFACES.filter((bg) => !NOT_USED_ON[fg]?.includes(bg)).map((bg): [string, string] => [fg, bg]),
).concat([
  ['color-fg-on-action', 'color-action'],
  ['color-fg-on-action', 'color-action-hover'],
  // Error text (field errors, alerts) sits on the light surfaces.
  ...['color-canvas', 'color-surface', 'color-surface-subtle'].map((bg): [string, string] => [
    'color-danger',
    bg,
  ]),
])

// Icons, status dots and the focus ring need 3:1 (WCAG 1.4.11).
const GRAPHICS = [
  'color-accent',
  'color-success',
  'color-danger',
  'color-icon-muted',
  'color-focus',
  'color-field-border',
]
const GRAPHIC_SURFACES = ['color-surface', 'color-surface-subtle', 'color-canvas', 'color-selected']
const GRAPHIC_NOT_USED_ON: Record<string, string[]> = {
  'color-accent': ['color-surface-subtle', 'color-selected'],
}
const GRAPHIC_PAIRS = GRAPHICS.flatMap((fg) =>
  GRAPHIC_SURFACES.filter((bg) => !GRAPHIC_NOT_USED_ON[fg]?.includes(bg)).map(
    (bg): [string, string] => [fg, bg],
  ),
)

describe('color tokens', () => {
  it.each(TEXT_PAIRS)('%s on %s reaches WCAG AA for text', (fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5)
  })

  it.each(GRAPHIC_PAIRS)('%s on %s reaches 3:1 for graphics', (fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(3)
  })
})

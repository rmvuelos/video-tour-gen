import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const fileRule = z.object({
  mimeTypes: z.array(z.string().regex(/^[a-z]+\/[a-z0-9.+-]+$/)).min(1),
  extensions: z.array(z.string().regex(/^\.[a-z0-9]+$/)).min(1),
  maxCount: z.number().int().positive(),
  maxBytes: z.number().int().positive(),
})

const inputLimits = z.object({
  floorPlan: fileRule.extend({ maxPdfPages: z.number().int().positive() }),
  photos: fileRule.extend({ minCount: z.number().int().positive() }),
  description: z.object({ maxChars: z.number().int().positive() }),
  areaSquareMeters: z.object({ optional: z.boolean(), exclusiveMin: z.number().min(0) }),
})

const raw: unknown = JSON.parse(
  readFileSync(new URL('../../../shared/input-limits.json', import.meta.url), 'utf8'),
)

describe('shared/input-limits.json', () => {
  it('matches the expected shape', () => {
    expect(inputLimits.safeParse(raw).success).toBe(true)
  })

  it('encodes the documented MVP limits', () => {
    const limits = inputLimits.parse(raw)
    expect(limits.floorPlan.maxBytes).toBe(20 * 1024 * 1024)
    expect(limits.floorPlan.maxCount).toBe(1)
    expect(limits.floorPlan.maxPdfPages).toBe(50)
    expect(limits.photos.maxBytes).toBe(12 * 1024 * 1024)
    expect([limits.photos.minCount, limits.photos.maxCount]).toEqual([3, 10])
    expect(limits.description.maxChars).toBe(2000)
  })
})

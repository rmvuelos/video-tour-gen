import { describe, expect, it } from 'vitest'
import { AREA_MAX_M2, areaError, descriptionError, parseArea } from './details'

describe('parseArea', () => {
  it.each([
    ['', null],
    ['   ', null],
    ['85', 85],
    ['85.5', 85.5],
    ['85,5', 85.5],
    [' 0.5 ', 0.5],
    [String(AREA_MAX_M2), AREA_MAX_M2],
  ])('accepts %j as %j', (text, value) => {
    expect(parseArea(text)).toEqual({ value })
  })

  it.each(['0', '-3', 'abc', '12 m2', '1e3', 'Infinity', 'NaN', '1.2.3', String(AREA_MAX_M2 + 1)])(
    'rejects %j with a message',
    (text) => {
      const result = parseArea(text)
      expect(result.value).toBeUndefined()
      expect(areaError(text)).toMatch(/\S/)
    },
  )

  it.each(['1,000', '12,345', '1,000.5'])('rejects %j as a thousands separator', (text) => {
    expect(areaError(text)).toBe('Use a dot or comma for decimals, without thousands separators.')
  })

  it('still takes a comma with one or two decimals', () => {
    expect(parseArea('1,5')).toEqual({ value: 1.5 })
    expect(parseArea('1,25')).toEqual({ value: 1.25 })
  })

  it('says the maximum', () => {
    expect(areaError('999999')).toContain('100,000')
  })

  it('has no error for an empty or valid area', () => {
    expect(areaError('')).toBeUndefined()
    expect(areaError('42')).toBeUndefined()
  })
})

describe('descriptionError', () => {
  it('accepts empty text and exactly the maximum', () => {
    expect(descriptionError('')).toBeUndefined()
    expect(descriptionError('a'.repeat(2000))).toBeUndefined()
  })

  it('rejects one character more, counting emoji as one', () => {
    expect(descriptionError('a'.repeat(2001))).toContain('2,000')
    expect(descriptionError('😀'.repeat(2000))).toBeUndefined()
  })
})

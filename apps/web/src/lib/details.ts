import limits from '../../../../shared/input-limits.json'

/** Mirrors AREA_MAX_M2 in services/backend/app/submit.py (a sanity cap; the server decides). */
export const AREA_MAX_M2 = 100_000
export const DESCRIPTION_MAX = limits.description.maxChars

// "1,000" would read as 1 with a decimal comma: ask for another format instead.
const THOUSANDS = /,\d{3}(\D|$)/
const NUMBER = /^\d+(\.\d+)?$/

/** Empty is `null` (the field is optional); `value` is undefined when the text is not valid. */
export function parseArea(text: string): { value: number | null } | { value?: undefined } {
  const clean = text.trim().replace(',', '.')
  if (!clean) return { value: null }
  if (THOUSANDS.test(text)) return {}
  const value = NUMBER.test(clean) ? Number(clean) : NaN
  return value > 0 && value <= AREA_MAX_M2 ? { value } : {}
}

export function areaError(text: string): string | undefined {
  if (THOUSANDS.test(text)) return 'Use a dot or comma for decimals, without thousands separators.'
  if (parseArea(text).value !== undefined) return undefined
  return `Enter a number above 0 and up to ${AREA_MAX_M2.toLocaleString('en-US')}, like 85.5.`
}

export function descriptionError(text: string): string | undefined {
  if ([...text].length <= DESCRIPTION_MAX) return undefined
  return `Use ${DESCRIPTION_MAX.toLocaleString('en-US')} characters or fewer.`
}

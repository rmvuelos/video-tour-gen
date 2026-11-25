const UNITS = ['B', 'KB', 'MB', 'GB']
const round1 = (n: number) => Math.round(n * 10) / 10

/** 12994560 -> "12.4 MB" (1 KB = 1024 B, like the shared limits). Invalid input gives "0 B". */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B'
  let value = bytes
  let unit = 0
  // Round before choosing the unit: 1048575 B is "1 MB", not "1024 KB".
  while (round1(value) >= 1024 && unit < UNITS.length - 1) {
    value /= 1024
    unit++
  }
  return `${unit === 0 ? Math.round(value) : round1(value)} ${UNITS[unit]}`
}

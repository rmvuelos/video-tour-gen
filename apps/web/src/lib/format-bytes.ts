const UNITS = ['B', 'KB', 'MB', 'GB']

/** 12994560 -> "12.4 MB" (1 KB = 1024 B, like the shared limits: 12 MB = 12582912). */
export function formatBytes(bytes: number): string {
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024
    unit++
  }
  return `${unit === 0 ? value : value.toFixed(1).replace(/\.0$/, '')} ${UNITS[unit]}`
}

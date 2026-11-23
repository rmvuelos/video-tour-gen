// Fails if a production build of apps/web ships the /dev/ui gallery (it is dev and e2e only).
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'

const MARKERS = ['UiGallery', 'UI primitives']
const dist = join(import.meta.dirname, '..', 'apps', 'web', 'dist')

const files = readdirSync(dist, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => join(entry.parentPath, entry.name))

const leaks = files.filter((file) => {
  const text = file.endsWith('.woff2') ? '' : readFileSync(file, 'utf8')
  return MARKERS.some((marker) => file.includes(marker) || text.includes(marker))
})

if (leaks.length > 0) {
  console.error(`The dev gallery reached the production build:\n${leaks.join('\n')}`)
  process.exit(1)
}
console.log(`ok: no dev gallery in ${files.length} files of apps/web/dist`)

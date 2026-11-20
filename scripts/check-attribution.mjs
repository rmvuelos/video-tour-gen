// Fails when a commit message in <range> carries AI attribution.
// Usage: node scripts/check-attribution.mjs <base>..<head>   |   --message "<text>" (self-test)
import { execFileSync } from 'node:child_process'

const FORBIDDEN = /co-authored-by|generated with|claude|anthropic/i

const [flag, value] = process.argv.slice(2)
let messages
if (flag === '--message') {
  messages = [{ id: 'message', body: value ?? '' }]
} else if (flag) {
  const out = execFileSync('git', ['log', '--format=%H%x00%B%x01', flag], { encoding: 'utf8' })
  messages = out
    .split('\x01')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const [id, body = ''] = chunk.split('\x00')
      return { id: id.slice(0, 8), body }
    })
} else {
  console.error('usage: check-attribution.mjs <range> | --message <text>')
  process.exit(2)
}

const bad = messages.filter(({ body }) => FORBIDDEN.test(body))
for (const { id, body } of bad) {
  console.error(`attribution found in ${id}: ${body.split('\n')[0]}`)
}
if (bad.length) process.exit(1)
console.log(`ok: ${messages.length} commit message(s) without attribution`)

// Runs the backend `integration` tests against the running local Supabase stack.
// Usage: node scripts/run-integration.mjs "<supabase cmd>" "<compose cmd>" (the CI and verify:ci share it).
// Secrets travel only as process env (`-e NAME` without a value): nothing is written to disk.
import { spawnSync } from 'node:child_process'
import process from 'node:process'

const [supabase = 'supabase', compose = 'docker compose'] = process.argv.slice(2)

const status = spawnSync(`${supabase} status -o env`, { shell: true, encoding: 'utf8' })
if (status.status !== 0) {
  console.error('supabase status failed: is the stack running?')
  process.exit(1)
}
const local = Object.fromEntries(
  [...status.stdout.matchAll(/^(\w+)="(.*)"$/gm)].map(([, key, value]) => [key, value]),
)

// The container reaches the host's published ports through host.docker.internal.
const toHost = (url) => url.replace('127.0.0.1', 'host.docker.internal')
const env = {
  DATABASE_URL: toHost(local.DB_URL),
  SUPABASE_URL: toHost(local.API_URL),
  SUPABASE_JWKS_URL: `${toHost(local.API_URL)}/auth/v1/.well-known/jwks.json`,
  SUPABASE_JWT_ISSUER: `${local.API_URL}/auth/v1`, // what the token's iss carries
  SUPABASE_SECRET_KEY: local.SECRET_KEY,
  SUPABASE_PUBLISHABLE_KEY: local.PUBLISHABLE_KEY,
}
const flags = Object.keys(env)
  .map((name) => `-e ${name}`)
  .join(' ')
const run = spawnSync(`${compose} run --rm ${flags} backend pytest -m integration --no-cov`, {
  shell: true,
  stdio: 'inherit',
  env: { ...process.env, ...env },
})
process.exit(run.status ?? 1)

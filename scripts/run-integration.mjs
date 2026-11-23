// Runs the backend `integration` tests against the running local Supabase stack.
// Usage: node scripts/run-integration.mjs "<supabase cmd>" "<compose cmd>" (the CI and verify:ci share it).
// Secrets travel only as process env (`-e NAME` without a value): never in arguments, files or output.
import { spawnSync } from 'node:child_process'
import process from 'node:process'

const [supabase = 'supabase', compose = 'docker compose'] = process.argv.slice(2)

// No shell. On Windows `pnpm` is only a .cmd shim, which Node can run only through cmd.exe.
function run(commandLine, args, options) {
  const parts = [...commandLine.split(' '), ...args]
  const [bin, ...rest] =
    process.platform === 'win32' && parts[0] === 'pnpm'
      ? ['cmd.exe', '/d', '/s', '/c', ...parts]
      : parts
  return spawnSync(bin, rest, options)
}

const status = run(supabase, ['status', '-o', 'env'], { encoding: 'utf8' })
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
const names = [...Object.keys(env), ...(process.env.CI ? ['CI'] : [])] // CI: missing env fails
const result = run(
  compose,
  [
    'run',
    '--rm',
    ...names.flatMap((name) => ['-e', name]),
    'backend',
    'pytest',
    '-m',
    'integration',
    '--no-cov',
  ],
  { encoding: 'utf8', stdio: ['inherit', 'pipe', 'inherit'], env: { ...process.env, ...env } },
)
process.stdout.write(result.stdout ?? '')
// All-skipped or empty runs exit 0 or 5: only a run with passing tests counts.
if (result.status !== 0 || !/\d+ passed/.test(result.stdout ?? '')) {
  console.error('integration tests failed or no test passed')
  process.exit(1)
}

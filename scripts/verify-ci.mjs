// Runs the same checks as .github/workflows/ci.yml, in order, stopping at the first failure.
// Python and gitleaks run in Docker (see README). Keep this file in sync with the workflow.
import { spawnSync } from 'node:child_process'
import process from 'node:process'

const GITLEAKS_IMAGE = 'ghcr.io/gitleaks/gitleaks:v8.30.1'
const PIP_AUDIT = 'pip-audit==2.10.1'
// Own project name: the final `down` must not stop the dev stack (`video-tour-gen`).
// The image name is fixed in docker-compose.yml, so it is shared and not rebuilt.
const compose =
  'docker compose -p video-tour-gen-ci -f infra/docker-compose.yml -f infra/docker-compose.ci.yml'
const backend = `${compose} run --rm backend`
const cwd = process.cwd()
const supabase = 'pnpm dlx supabase@3.2.0'

// Same env as the CI; VITE_* is stripped so the web build runs without secrets.
const env = { CI: '1', IGNORE_LOCAL_ENV: '1' }
const baseEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith('VITE_')),
)

const jobs = [
  [
    'web-quality',
    [
      'pnpm --filter web lint',
      'pnpm --filter web typecheck',
      'pnpm exec prettier --check .',
      'pnpm exec knip',
    ],
  ],
  ['web-test', ['pnpm --filter web test:coverage']],
  ['web-build', ['pnpm --filter web build', 'node scripts/check-no-dev-routes.mjs']],
  [
    'py-quality',
    [
      `${compose} build backend`,
      `${backend} ruff check .`,
      `${backend} ruff format --check .`,
      `${backend} mypy`,
    ],
  ],
  ['py-test', [`${backend} pytest --cov-fail-under=80`]],
  [
    'e2e',
    [
      // Windows uses the system Edge (playwright.config.ts); elsewhere install Chromium.
      ...(process.platform === 'win32'
        ? []
        : ['pnpm --filter web exec playwright install chromium']),
      'pnpm --filter web e2e',
    ],
  ],
  [
    'db',
    [
      `${supabase} start -x studio,realtime,edge-runtime,imgproxy,logflare,vector,postgres-meta,supavisor,mailpit`,
      `${supabase} db reset`,
      `${supabase} test db`,
      `node scripts/run-integration.mjs "${supabase}" "${compose}"`,
    ],
  ],
  [
    'security',
    [
      `docker run --rm -v "${cwd}:/repo:ro" -e GIT_CONFIG_COUNT=1 -e GIT_CONFIG_KEY_0=safe.directory -e GIT_CONFIG_VALUE_0=/repo ${GITLEAKS_IMAGE} git /repo --redact --no-banner --ignore-gitleaks-allow`,
      'pnpm audit --audit-level high',
      `${backend} sh -c "uv export --frozen --no-emit-project -o /tmp/req.txt >/dev/null && uv tool run ${PIP_AUDIT} -r /tmp/req.txt --disable-pip"`,
    ],
  ],
  [
    'commits',
    [
      'pnpm exec commitlint --from origin/main --to HEAD',
      'node --test scripts/attribution.test.mjs',
      'node scripts/check-attribution.mjs origin/main..HEAD',
    ],
  ],
]

// The commits job compares against origin/main: refresh it, but keep going offline.
function refreshMain() {
  const { status } = spawnSync('git fetch origin main', { shell: true, stdio: 'ignore' })
  if (status !== 0)
    console.warn('warning: git fetch origin main failed; using the local origin/main')
}

const results = []
let failed = false
for (const [name, steps] of jobs) {
  console.log(`\n=== ${name} ===`)
  const start = Date.now()
  let ok = true
  for (const step of steps) {
    console.log(`$ ${step}`)
    const { status } = spawnSync(step, {
      shell: true,
      stdio: 'inherit',
      env: { ...baseEnv, ...env },
    })
    if (status !== 0) {
      ok = false
      break
    }
  }
  results.push({ name, ok, seconds: (Date.now() - start) / 1000 })
  if (!ok) {
    failed = true
    break
  }
}

// Stop what the jobs start: redis (a `compose run` dependency) and the Supabase stack.
spawnSync(`${compose} down`, { shell: true, stdio: 'ignore' })
spawnSync(`${supabase} stop --no-backup`, { shell: true, stdio: 'ignore' })

console.log('\n=== summary ===')
for (const { name, ok, seconds } of results) {
  console.log(`${ok ? '✔' : '✖'} ${name.padEnd(12)} ${seconds.toFixed(1)}s`)
}
for (const [name] of jobs.slice(results.length)) console.log(`- ${name.padEnd(12)} skipped`)
process.exit(failed ? 1 : 0)

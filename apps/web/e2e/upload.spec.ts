import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { expect, test, type Page } from '@playwright/test'

// Same approach as projects.spec.ts: the API, Supabase auth and the signed-URL storage PUT are
// mocked in the browser (the e2e job runs neither), against the production build.
const SUPABASE_URL = 'http://127.0.0.1:55421'
const API = 'http://127.0.0.1:58000'
const SESSION_KEY = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
}
const SESSION = {
  access_token: 'e2e-access-token',
  refresh_token: 'e2e-refresh-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: 4_000_000_000,
  user: { id: 'u1', email: 'adri.martin@example.test', aud: 'authenticated' },
}

test.skip(!!process.env['E2E_SUPABASE'], 'these specs mock Supabase and the API')

const shotsDir = process.env['DESIGN_SHOTS_DIR']

type Row = {
  id: string
  kind: 'plan' | 'photo'
  filename: string
  size: number
  mime: string
  status: string
  error_code: string | null
  page_index: number | null
}

type Options = {
  /** How the ingest ends: the job is `done` and the project becomes this. */
  outcome?: 'ready' | 'needs_fix'
  /** Where the signed URLs point; the default is a path on the mocked Supabase origin. */
  uploadBase?: string
}

/** A tiny stateful backend: the files registered, the project status and the ingest job. */
async function mockBackend(page: Page, { outcome = 'ready', uploadBase }: Options = {}) {
  await page.addInitScript(
    ([key, session]) => localStorage.setItem(key as string, JSON.stringify(session)),
    [SESSION_KEY, SESSION],
  )
  const rows: Row[] = []
  const seen = { registers: 0, submits: 0, submit: undefined as unknown, polls: 0 }
  let status = 'draft'
  const project = () => ({
    id: 'p1',
    name: 'Arles bedroom',
    status,
    area_m2: null,
    description: null,
    created_at: '2026-11-20T10:00:00Z',
  })

  await page.route(`${SUPABASE_URL}/storage/**`, (route) =>
    route.fulfill({ status: route.request().method() === 'OPTIONS' ? 204 : 200, headers: CORS }),
  )
  await page.route(`${API}/**`, async (route) => {
    const request = route.request()
    const { pathname } = new URL(request.url())
    const json = (code: number, body?: object) =>
      route.fulfill({
        status: code,
        headers: CORS,
        ...(body && { contentType: 'application/json', body: JSON.stringify(body) }),
      })
    const method = request.method()
    if (method === 'OPTIONS') return json(204)
    if (pathname === '/projects/p1' && method === 'GET') return json(200, project())
    if (pathname === '/projects/p1/files' && method === 'GET') return json(200, { files: rows })
    if (pathname === '/projects/p1/files' && method === 'POST') {
      seen.registers += 1
      const { files } = request.postDataJSON() as { files: Omit<Row, 'id' | 'status'>[] }
      const targets = files.map((f) => {
        const id = `f${rows.length + 1}`
        rows.push({ ...f, id, status: 'pending', error_code: null, page_index: null })
        const base = uploadBase ?? `${SUPABASE_URL}/storage/v1/object/upload/sign/originals`
        return { file_id: id, kind: f.kind, mime: f.mime, upload_url: `${base}/${id}`, headers: {} }
      })
      return json(201, { files: targets })
    }
    if (pathname === '/projects/p1/submit' && method === 'POST') {
      seen.submits += 1
      seen.submit = request.postDataJSON()
      status = 'ingesting'
      return json(202, { id: 'j1', project_id: 'p1', status: 'queued', created_at: '' })
    }
    if (pathname === '/projects/p1/jobs/latest') {
      const finished = (seen.polls += 1) > 1
      if (finished) {
        status = outcome
        if (outcome === 'needs_fix') {
          Object.assign(
            rows.find((r) => r.kind === 'photo')!,
            {
              status: 'invalid',
              error_code: 'corrupt_file',
            },
          )
        }
      }
      return json(200, {
        id: 'j1',
        project_id: 'p1',
        status: finished ? 'done' : 'running',
        error_code: null,
        attempts: 1,
        files: rows.map((r) => ({ id: r.id, kind: r.kind, status: 'uploaded', error_code: null })),
      })
    }
    return json(404, { error: { code: 'not_found', message: 'Not found.' } })
  })
  return { rows, seen }
}

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAXz8bOgAAAABJRU5ErkJggg==',
  'base64',
)
const file = (name: string, mimeType = 'image/png', buffer = PNG) => ({ name, mimeType, buffer })
const planInput = (page: Page) => page.locator('input[type=file]').nth(0)
const photoInput = (page: Page) => page.locator('input[type=file]').nth(1)

async function addAll(page: Page) {
  await planInput(page).setInputFiles(file('plan.png'))
  await photoInput(page).setInputFiles(['a', 'b', 'c'].map((n) => file(`${n}.png`)))
  await expect(page.getByText(/Uploaded$/)).toHaveCount(4)
}

const send = (page: Page) => page.getByRole('button', { name: 'Check my files' })

test('uploads a plan and photos, sends the details and follows the ingest to ready', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  const { seen } = await mockBackend(page)
  await page.goto('/projects/p1')
  await expect(page.getByRole('heading', { name: 'Arles bedroom' })).toBeFocused()
  await expect(send(page)).toHaveAttribute('aria-disabled', 'true')
  await expect(send(page)).toHaveAccessibleDescription('Add the floor plan.')

  await addAll(page)
  await expect(send(page)).not.toHaveAttribute('aria-disabled', 'true')

  await page.getByLabel('Area (m²)').fill('85,5')
  await page.getByLabel('Description').fill('Sunny corner flat')
  if (shotsDir) await page.screenshot({ path: `${shotsDir}/uploader-4d.png` })
  await send(page).dblclick()

  await expect(page.getByRole('heading', { name: 'Checking your files' })).toBeFocused()
  await expect(page.getByRole('heading', { name: 'Your files are ready' })).toBeFocused({
    timeout: 15_000,
  })
  expect(seen.submits).toBe(1) // the double click sent one request
  expect(seen.submit).toEqual({
    plan_page_index: 0,
    area_m2: 85.5,
    description: 'Sunny corner flat',
  })
})

test('rejects a HEIC photo before uploading it', async ({ page }) => {
  const { seen } = await mockBackend(page)
  await page.goto('/projects/p1')
  await photoInput(page).setInputFiles(file('hall.heic', 'image/heic'))
  await expect(page.getByRole('alert')).toContainText(
    'hall.heic is a HEIC photo. Export it as JPG and try again.',
  )
  expect(seen.registers).toBe(0)
})

test('shows intermediate progress while a large file uploads', async ({ page }) => {
  test.setTimeout(120_000) // the slow server is slower still with the other specs running
  // The mocked route would answer at once, so this PUT goes to a real server that reads slowly.
  const server = await slowServer()
  try {
    const { port } = server.address() as AddressInfo
    await mockBackend(page, { uploadBase: `http://127.0.0.1:${port}` })
    await page.goto('/projects/p1')
    await planInput(page).setInputFiles(
      file('plan.png', 'image/png', Buffer.alloc(19 * 1024 * 1024)),
    )
    const bar = page.getByRole('progressbar').first()
    const values = new Set<number>()
    await expect(async () => {
      // The bar is gone once the upload ends, so a missing bar is not an error.
      const now = await bar.getAttribute('aria-valuenow', { timeout: 200 }).catch(() => null)
      if (now !== null) values.add(Number(now))
      await expect(page.getByText(/Uploaded$/)).toBeVisible({ timeout: 100 })
    }).toPass({ timeout: 110_000, intervals: [50] })
    expect([...values].some((v) => v > 0 && v < 100)).toBe(true)
  } finally {
    server.closeAllConnections()
    server.close()
  }
})

test('returns to the uploader with the invalid file marked after the ingest', async ({ page }) => {
  await mockBackend(page, { outcome: 'needs_fix' })
  await page.goto('/projects/p1')
  await addAll(page)
  await send(page).click()
  await expect(page.getByRole('alert')).toContainText('1 file needs fixing', { timeout: 15_000 })
  await expect(
    page.getByText('The file is damaged or unreadable. Choose another one.'),
  ).toBeVisible()
  await expect(send(page)).toHaveAttribute('aria-disabled', 'true')
})

test('is usable at 1024 px without horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 })
  await mockBackend(page)
  await page.goto('/projects/p1')
  await addAll(page)
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBe(0)
})

/** Accepts a PUT but reads the body in small steps, so the browser reports partial progress. */
function slowServer(): Promise<Server> {
  const server = createServer((req, res) => {
    const headers = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': '*',
    }
    if (req.method === 'OPTIONS') return void res.writeHead(204, headers).end()
    req.on('data', () => {
      req.pause()
      setTimeout(() => req.resume(), 15)
    })
    req.on('end', () => res.writeHead(200, headers).end())
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)))
}

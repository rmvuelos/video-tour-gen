import { expect, test, type Page } from '@playwright/test'

// The API and Supabase are mocked in the browser (the e2e job runs neither): the build points
// at these fake origins (see playwright.config.ts) and the session is seeded in localStorage.
const SUPABASE_URL = 'http://127.0.0.1:55421'
const API = 'http://127.0.0.1:58000'
// supabase-js 2.119.2 keeps the session under `sb-<first label of the host>-auth-token`.
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
const project = (n: number, status = 'draft') => ({
  id: `p${n}`,
  name: `Arles bedroom ${n}`,
  status,
  created_at: '2026-11-20T10:00:00Z',
})
const projects = (count: number) => Array.from({ length: count }, (_, i) => project(i + 1, 'ready'))

test.skip(!!process.env['E2E_SUPABASE'], 'these specs mock Supabase and the API')

/** `failFirstList` answers the first GET /projects with a 500, to exercise "Try again". */
async function mockApi(page: Page, all: object[], { failFirstList = false } = {}) {
  await page.addInitScript(
    ([key, session]) => localStorage.setItem(key as string, JSON.stringify(session)),
    [SESSION_KEY, SESSION],
  )
  let listCalls = 0
  const posts: string[] = []
  await page.route(`${API}/**`, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const json = (status: number, body: object) =>
      route.fulfill({
        status,
        headers: CORS,
        contentType: 'application/json',
        body: JSON.stringify(body),
      })
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (request.method() === 'POST') {
      posts.push(url.pathname)
      return json(201, project(9))
    }
    if (url.pathname !== '/projects') return json(200, project(9))
    if (failFirstList && listCalls++ === 0) {
      return json(500, { error: { code: 'internal_error', message: 'Server error.' } })
    }
    const limit = Number(url.searchParams.get('limit'))
    const offset = Number(url.searchParams.get('offset'))
    return json(200, { items: all.slice(offset, offset + limit), limit, offset })
  })
  return { posts }
}

const shotsDir = process.env['DESIGN_SHOTS_DIR']

test('lists the projects of the user', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await mockApi(page, [project(1, 'ready'), project(2, 'needs_fix'), project(3, 'draft')])
  await page.goto('/')
  await expect(page).toHaveURL(/\/projects$/)
  await expect(page.getByRole('heading', { name: 'My projects' })).toBeFocused()
  await expect(page.getByRole('link', { name: 'Arles bedroom 2' })).toBeVisible()
  await expect(page.getByText('Needs fixes')).toBeVisible()
  if (shotsDir) await page.screenshot({ path: `${shotsDir}/projects.png` })
})

test('loads more projects by offset', async ({ page }) => {
  await mockApi(page, projects(25))
  await page.goto('/projects')
  await expect(page.getByRole('link', { name: 'Arles bedroom 20' })).toBeVisible()
  await page.getByRole('button', { name: 'Load more' }).click()
  await expect(page.getByRole('link', { name: 'Arles bedroom 21' })).toBeFocused()
  await expect(page.getByRole('link', { name: 'Arles bedroom 25' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Load more' })).toHaveCount(0)
})

test('shows a server error and recovers with Try again', async ({ page }) => {
  await mockApi(page, projects(2), { failFirstList: true })
  await page.goto('/projects')
  await expect(page.getByRole('alert')).toContainText('Server error.')
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('link', { name: 'Arles bedroom 2' })).toBeVisible()
})

test('shows the empty state and creates a project with one request', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  const { posts } = await mockApi(page, [])
  await page.goto('/projects')
  await expect(page.getByText(/No projects yet/)).toBeVisible()
  if (shotsDir) await page.screenshot({ path: `${shotsDir}/projects-empty.png` })
  await page.getByLabel(/Project name/).fill('Loft')
  await page.getByRole('button', { name: 'Create project' }).dblclick()
  await expect(page).toHaveURL(/\/projects\/p9$/)
  await expect(page.getByRole('heading', { name: 'Arles bedroom 9' })).toBeFocused()
  expect(posts).toEqual(['/projects'])
})

test('is usable at 1024 px without horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 })
  await mockApi(page, projects(1))
  await page.goto('/projects')
  await expect(page.getByRole('link', { name: 'Arles bedroom 1' })).toBeVisible()
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBe(0)
})

import { expect, test, type Page } from '@playwright/test'

// The API and Supabase are mocked in the browser (the e2e job runs neither): the build points
// at these fake origins (playwright.config.ts) and the session is seeded in localStorage.
const API = 'http://127.0.0.1:58000'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
}
const FAR_FUTURE = 4_000_000_000
const SESSION = {
  access_token: 'e2e-access-token',
  refresh_token: 'e2e-refresh-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: FAR_FUTURE,
  user: { id: 'u1', email: 'adri.martin@example.test', aud: 'authenticated' },
}
const project = (n: number, status: string) => ({
  id: `p${n}`,
  name: `Arles bedroom ${n}`,
  status,
  created_at: '2026-11-20T10:00:00Z',
})

async function mockApi(page: Page, items: object[]) {
  await page.addInitScript(
    (session) => localStorage.setItem('sb-127-auth-token', JSON.stringify(session)),
    SESSION,
  )
  await page.route(`${API}/**`, async (route) => {
    const request = route.request()
    const { pathname } = new URL(request.url())
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    const json = (status: number, body: object) =>
      route.fulfill({
        status,
        headers: CORS,
        contentType: 'application/json',
        body: JSON.stringify(body),
      })
    if (request.method() === 'POST') return json(201, project(9, 'draft'))
    if (pathname === '/projects') return json(200, { items, limit: 20, offset: 0 })
    return json(200, project(9, 'draft'))
  })
}

test('lists the projects of the user', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await mockApi(page, [project(1, 'ready'), project(2, 'needs_fix'), project(3, 'draft')])
  await page.goto('/')
  await expect(page).toHaveURL(/\/projects$/)
  await expect(page.getByRole('link', { name: 'Arles bedroom 2' })).toBeVisible()
  await expect(page.getByText('Needs fixes')).toBeVisible()
  const dir = process.env['DESIGN_SHOTS_DIR']
  if (dir) await page.screenshot({ path: `${dir}/projects.png` })
})

test('shows the empty state and creates a project', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await mockApi(page, [])
  await page.goto('/projects')
  await expect(page.getByText(/No projects yet/)).toBeVisible()
  const dir = process.env['DESIGN_SHOTS_DIR']
  if (dir) await page.screenshot({ path: `${dir}/projects-empty.png` })
  await page.getByLabel(/Project name/).fill('Loft')
  await page.getByRole('button', { name: 'Create project' }).click()
  await expect(page).toHaveURL(/\/projects\/p9$/)
  await expect(page.getByRole('link', { name: 'Upload assets' }).last()).toBeVisible()
})

test('is usable at 1024 px without horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 })
  await mockApi(page, [project(1, 'ready')])
  await page.goto('/projects')
  await expect(page.getByRole('link', { name: 'Arles bedroom 1' })).toBeVisible()
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBe(0)
})

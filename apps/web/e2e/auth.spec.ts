import { expect, test } from '@playwright/test'

test('the sign-in page renders and links to signup', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  const dir = process.env['DESIGN_SHOTS_DIR']
  if (dir) await page.screenshot({ path: `${dir}/login.png` })
  await page.keyboard.press('Tab')
  await expect(page.getByLabel(/Email/)).toBeFocused()
  if (dir) await page.screenshot({ path: `${dir}/login-focus.png` })
  await page.getByRole('link', { name: 'Create an account' }).click()
  await expect(page.getByRole('heading', { name: 'Create account' })).toBeVisible()
})

// Needs the local Supabase and a build with VITE_* set (see apps/web/.env.example); CI does not run it yet.
test.describe('against the local Supabase', () => {
  test.skip(!process.env['E2E_SUPABASE'], 'set E2E_SUPABASE=1 with Supabase running')

  test('signup, protected route, logout and login', async ({ page }) => {
    const email = `e2e-${Date.now()}@example.test`
    const password = 'e2e-password-1'
    await page.goto('/signup')
    await page.getByLabel(/Email/).fill(email)
    await page.getByLabel(/Password/).fill(password)
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page.getByRole('heading', { name: 'My projects' })).toBeVisible()

    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
    await page.goto('/')
    await expect(page).toHaveURL(/\/login$/)

    await page.getByLabel(/Email/).fill(email)
    await page.getByLabel(/Password/).fill(password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('heading', { name: 'My projects' })).toBeVisible()
  })
})

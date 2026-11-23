import { expect, test } from '@playwright/test'

test('/dev/ui renders the primitives gallery', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/dev/ui')
  await expect(page.getByRole('heading', { name: 'UI primitives' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continue to preflight' }).first()).toBeVisible()
  // Reference capture for design review; baselines in the repo come in phase 6.
  const dir = process.env['DESIGN_SHOTS_DIR']
  if (dir) await page.screenshot({ path: `${dir}/dev-ui.png`, fullPage: true })
})

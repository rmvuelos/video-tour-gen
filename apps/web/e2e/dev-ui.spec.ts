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

test('the stepper fits a 750px container without horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 })
  await page.goto('/dev/ui')
  const box = page.getByTestId('stepper-750')
  await expect(box.getByRole('list', { name: 'Progress' })).toBeVisible()
  const { scroll, client } = await box.evaluate((el) => ({
    scroll: el.scrollWidth,
    client: el.clientWidth,
  }))
  expect(client).toBe(750)
  expect(scroll).toBeLessThanOrEqual(client)
})

test('masked icons keep the system color in forced-colors mode', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' })
  await page.goto('/dev/ui')
  const [icon, buttonText] = await page.evaluate(() => {
    const probe = Object.assign(document.createElement('i'), { style: 'color: ButtonText' })
    document.body.append(probe)
    const expected = getComputedStyle(probe).color
    probe.remove()
    return [getComputedStyle(document.querySelector('[data-icon]')!).backgroundColor, expected]
  })
  expect(icon).toBe(buttonText)
})

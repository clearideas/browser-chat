import { expect, type Page, test } from '@playwright/test'

// A site that hides the launcher and opens the chat from its own button
// (tests/e2e/pages/hidden-launcher.html).

/** Clicks the middle of the widget's fixed corner box, where the launcher sits when shown. */
async function clickLauncherSpot(page: Page) {
  const box = await page.locator('.ci-widget').boundingBox()
  expect(box).not.toBeNull()
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)
}

const cornerClicks = (page: Page) => page.evaluate(() => (window as any).cornerClicks as number)

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/e2e/pages/hidden-launcher.html')
  await page.waitForFunction(() => (window as any).testWidget)
})

test('lets clicks through to the page while the launcher is hidden', async ({ page }) => {
  await expect(page.locator('.ci-widget-fab')).toHaveCount(0)
  await expect(page.locator('.ci-widget')).toHaveCSS('pointer-events', 'none')

  await clickLauncherSpot(page)
  await clickLauncherSpot(page)
  expect(await cornerClicks(page)).toBe(2)
  await expect(page.locator('#clicks')).toHaveText('2')
})

test('the launcher covers the spot only while shown', async ({ page }) => {
  await page.getByRole('button', { name: 'Show launcher' }).click()
  await expect(page.locator('.ci-widget-fab')).toBeVisible()
  await clickLauncherSpot(page) // opens the chat instead of reaching the page
  await expect(page.locator('.ci-widget-panel')).toBeVisible()
  expect(await cornerClicks(page)).toBe(0)

  await page.locator('.ci-widget-fab').click() // close
  await page.getByRole('button', { name: 'Hide launcher' }).click()
  await expect(page.locator('.ci-widget-fab')).toHaveCount(0)
  await clickLauncherSpot(page)
  expect(await cornerClicks(page)).toBe(1)
})

test("the site's own button opens the chat", async ({ page }) => {
  await page.getByRole('button', { name: 'Open chat' }).click()
  await expect(page.locator('.ci-widget-panel textarea')).toBeVisible()
  await expect(page.locator('.ci-widget-panel')).toContainText("Hi, I'm Ada")
})

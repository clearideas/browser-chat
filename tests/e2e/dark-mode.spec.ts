import { expect, type Page, test } from '@playwright/test'

// The Dark mode switch on every development page, and the widget following the page theme and the
// system preference live (the demo site's theme mode is "system").

const PAGES = [
  '/',
  '/dev.html',
  '/tests/e2e/pages/languages.html',
  '/tests/e2e/pages/hidden-launcher.html',
  '/tests/e2e/pages/isolation.html',
  '/tests/e2e/pages/csp.html',
]

const widgetIsDark = (page: Page) =>
  page.locator('.ci-widget').evaluate(element => element.classList.contains('ci-widget-dark'))

const pageBackground = (page: Page) =>
  page.evaluate(() => {
    const body = getComputedStyle(document.body).backgroundColor
    return body === 'rgba(0, 0, 0, 0)'
      ? getComputedStyle(document.documentElement).backgroundColor
      : body
  })

test.describe('Dark mode switch', () => {
  test.use({ colorScheme: 'light' })

  for (const path of PAGES) {
    test(`${path} switches the page and the widget`, async ({ page }) => {
      await page.goto(path)
      const toggle = page.locator('#dev-dark-mode')
      await expect(toggle).toBeVisible()
      await expect(toggle).not.toBeChecked()
      const lightBackground = await pageBackground(page)
      const hasWidget = path !== '/'
      if (hasWidget) {
        await expect(page.locator('.ci-widget')).toBeAttached()
        await expect.poll(() => widgetIsDark(page)).toBe(false)
      }

      await toggle.check()
      await expect(page.locator('html')).toHaveClass(/\bdark\b/)
      expect(await pageBackground(page)).not.toBe(lightBackground)
      if (hasWidget) await expect.poll(() => widgetIsDark(page)).toBe(true)

      await toggle.uncheck()
      await expect(page.locator('html')).toHaveClass(/\blight\b/)
      expect(await pageBackground(page)).toBe(lightBackground)
      if (hasWidget) await expect.poll(() => widgetIsDark(page)).toBe(false)
    })
  }

  test('the choice carries over to the other development pages', async ({ page }) => {
    await page.goto('/')
    await page.locator('#dev-dark-mode').check()
    await page.getByRole('link', { name: 'Demo site', exact: true }).click()
    await expect(page.locator('#dev-dark-mode')).toBeChecked()
    await expect.poll(() => widgetIsDark(page)).toBe(true)
    await page.locator('.ci-widget-fab').click()
    await expect(page.locator('#widget-theme')).toHaveText('dark')
  })
})

test.describe('system preference', () => {
  test('without a saved choice, pages and widget follow it, including changes', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto('/dev.html')
    await expect(page.locator('#dev-dark-mode')).toBeChecked()
    await expect.poll(() => widgetIsDark(page)).toBe(true)

    await page.emulateMedia({ colorScheme: 'light' })
    await expect(page.locator('#dev-dark-mode')).not.toBeChecked()
    await expect.poll(() => widgetIsDark(page)).toBe(false)
  })

  test('the widget follows it on a page without a theme of its own', async ({ page }) => {
    await page.goto('/dev.html')
    await expect(page.locator('.ci-widget')).toBeAttached()
    // Remove the development pages' theme markup: only the system preference is left.
    await page.evaluate(() => document.documentElement.classList.remove('dark', 'light'))
    await page.emulateMedia({ colorScheme: 'dark' })
    await expect.poll(() => widgetIsDark(page)).toBe(true)
    await page.emulateMedia({ colorScheme: 'light' })
    await expect.poll(() => widgetIsDark(page)).toBe(false)
  })
})

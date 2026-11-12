import { expect, test } from '@playwright/test'

import { BUILT_IN_LOCALES } from '../../src/i18n/locales'

// The development index page served at / (index.html) and the static server's directory handling.

test('shows the bundle and test server as ready', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle('Browser Chat – development')
  await expect(page.locator('#status-bundle')).toHaveClass('ok')
  await expect(page.locator('#status-bundle')).toContainText('built')
  await expect(page.locator('#status-server')).toHaveClass('ok')
  await expect(page.locator('#status-server')).toContainText('running (protocol v1)')
})

test('links only to pages that exist', async ({ page, request }) => {
  await page.goto('/')
  const hrefs = await page
    .locator('a')
    .evaluateAll(links => links.map(link => link.getAttribute('href')))
  expect(hrefs.length).toBeGreaterThan(10)
  for (const href of hrefs) {
    expect(href, 'links stay on the development server').toMatch(/^\//)
    const response = await request.get(href!)
    expect(response.status(), href!).toBe(200)
    // Shown in the browser rather than downloaded.
    expect(response.headers()['content-type'], href!).toMatch(
      /^(text\/(html|plain)|application\/json);/,
    )
  }
})

test('opens the demo page, which links back', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Demo site', exact: true }).click()
  await expect(page).toHaveURL(/\/dev\.html\?key=demo-public-key$/)
  await expect(page.locator('.ci-widget-fab')).toBeVisible()
  await page.getByRole('link', { name: '← All development pages' }).click()
  await expect(page).toHaveURL(/\/$/)
})

test('lists the demo in every built-in language', async ({ page }) => {
  await page.goto('/')
  const languages = await page
    .locator('#languages a')
    .evaluateAll(links =>
      links.map(link => new URL((link as HTMLAnchorElement).href).searchParams.get('lang')),
    )
  expect(languages).toEqual(BUILT_IN_LOCALES)
})

for (const path of [
  '/dev.html',
  '/tests/e2e/pages/languages.html',
  '/tests/e2e/pages/hidden-launcher.html',
  '/tests/e2e/pages/isolation.html',
  '/tests/e2e/pages/csp.html',
]) {
  test(`${path} loads cleanly and explains itself`, async ({ page }) => {
    const problems: string[] = []
    page.on('console', message => {
      if (message.type() === 'warning' || message.type() === 'error') problems.push(message.text())
    })
    page.on('pageerror', error => problems.push(error.message))
    await page.goto(path)
    await expect(page.locator('.ci-widget')).toBeAttached()
    await expect(page.locator('h1')).toBeVisible()
    if (path !== '/dev.html') await expect(page.locator('.expect')).toContainText('Expected:')
    await page.waitForLoadState('networkidle')
    expect(problems).toEqual([])
  })

  test(`${path} fits a phone screen without scrolling sideways`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto(path)
    // The widget's corner box (the launcher itself is hidden on the hidden-launcher page).
    await expect(page.locator('.ci-widget')).toBeInViewport()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
  })
}

test('answers other directories with 404 instead of a listing', async ({ request }) => {
  for (const path of ['/docs/', '/tests/e2e/pages/', '/src']) {
    expect((await request.get(path)).status(), path).toBe(404)
  }
  expect((await request.get('/index.html')).status()).toBe(200)
})

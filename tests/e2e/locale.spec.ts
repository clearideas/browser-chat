import { expect, type Page, test } from '@playwright/test'

import { mockPublicChat } from './mock-api'

test.beforeEach(async ({ page }) => mockPublicChat(page))

async function waitForLocale(page: Page, locale: 'en' | 'fr') {
  await page.waitForFunction(expectedLocale => {
    const debug = (window as any).__ClearIdeasWidgetLocaleDebug
    return debug && debug.currentLocale === expectedLocale
  }, locale)
}

async function getFab(page: Page) {
  const fab = page.locator('.ci-widget-fab')
  await expect(fab).toBeVisible()
  return fab
}

test('detects french locale on first load from html lang', async ({ page }) => {
  await page.goto('/locale-test.html?lang=fr')
  await waitForLocale(page, 'fr')

  const fab = await getFab(page)
  await expect(fab).toHaveAttribute('aria-label', 'Ouvrir le chat')
})

test('updates widget locale when html lang changes', async ({ page }) => {
  await page.goto('/locale-test.html?lang=en')
  await waitForLocale(page, 'en')

  const fab = await getFab(page)
  await expect(fab).toHaveAttribute('aria-label', 'Open chat')

  await page.selectOption('#lang-select', 'fr')
  await page.click('#apply-lang')
  await waitForLocale(page, 'fr')

  await expect(fab).toHaveAttribute('aria-label', 'Ouvrir le chat')
})

import { expect, test } from '@playwright/test'

import { mockPublicChat } from './mock-api'

test.beforeEach(async ({ page }) => mockPublicChat(page))

test('hidden widget FAB does not intercept clicks beneath its fixed hit area', async ({ page }) => {
  await page.goto('/hit-test.html')
  await page.waitForFunction(() => (window as any).testWidget)

  await expect(page.locator('.ci-widget-fab')).toBeVisible()

  await page.evaluate(() => {
    ;(window as any).testWidget.hide()
  })

  await expect(page.locator('.ci-widget-fab')).toHaveCount(0)
  await expect(page.locator('.ci-widget')).toHaveCSS('pointer-events', 'none')

  await page.locator('#underlay-button').click()

  await expect(page.locator('#underlay-button')).toHaveText('1')
})

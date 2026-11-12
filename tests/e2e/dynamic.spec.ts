import { expect, type Page, test } from '@playwright/test'

import { API_URL, PAGES_URL } from './helpers/ports'

// Pages that load the widget script or its element after the page is ready, as tag managers and
// single-page apps do.

const WIDGET_ELEMENT = `<div data-clearideas-widget data-access-key="demo-public-key" data-api-base-url="${API_URL}"></div>`

async function openPage(page: Page, body: string) {
  await page.route(`${PAGES_URL}/dynamic-test.html`, route =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html><body>${body}</body></html>`,
    }),
  )
  await page.goto('/dynamic-test.html')
  await page.waitForLoadState('load')
}

test('starts when the script is added after the page loaded', async ({ page }) => {
  await openPage(page, WIDGET_ELEMENT)
  await page.evaluate(() => {
    const script = document.createElement('script')
    script.src = '/dist/clearideas-widget.iife.js'
    document.body.appendChild(script)
  })
  await expect(page.locator('.ci-widget-fab')).toBeVisible()
})

test('starts when the widget element is added after the script loaded', async ({ page }) => {
  await openPage(page, '<script src="/dist/clearideas-widget.iife.js"></script>')
  await page.evaluate(element => {
    const main = document.createElement('main')
    main.innerHTML = element
    document.body.appendChild(main)
  }, WIDGET_ELEMENT)
  await expect(page.locator('.ci-widget-fab')).toBeVisible()
})

test('removes the widget when its element leaves the page', async ({ page }) => {
  await openPage(
    page,
    `<main id="route">${WIDGET_ELEMENT}</main><script src="/dist/clearideas-widget.iife.js"></script>`,
  )
  await expect(page.locator('.ci-widget-fab')).toBeVisible()

  await page.evaluate(() => document.getElementById('route')!.remove()) // route change
  await expect(page.locator('[data-clearideas-widget-host]')).toHaveCount(0)

  // A new route with a widget element gets a new widget.
  await page.evaluate(
    element => document.body.insertAdjacentHTML('beforeend', element),
    WIDGET_ELEMENT,
  )
  await expect(page.locator('.ci-widget-fab')).toBeVisible()
})

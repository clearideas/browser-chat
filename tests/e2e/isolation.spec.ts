import { expect, type Page, test } from '@playwright/test'

import { API_URL } from './helpers/ports'

// The widget renders in a shadow root: page CSS must not change it, its CSS must not reach the page,
// and it must work under a strict Content-Security-Policy. Playwright locators pierce open shadow
// roots, so '.ci-widget-fab' finds the button inside the widget.

const DEMO_ACCENT = 'rgb(40, 102, 207)' // demo site style.color #2866cf

async function openChatAndSend(page: Page, text: string) {
  await page.locator('.ci-widget-fab').click()
  await page.locator('.ci-widget-action--chat').click()
  const input = page.locator('.ci-widget-panel textarea')
  await input.fill(text)
  await input.press('Enter')
  await expect(page.locator('.generating-item')).toHaveCount(0)
}

function computed(page: Page, selector: string, properties: string[]) {
  return page
    .locator(selector)
    .first()
    .evaluate(
      (element, names) =>
        Object.fromEntries(
          names.map(name => [name, getComputedStyle(element).getPropertyValue(name)]),
        ),
      properties,
    )
}

test('renders inside an open shadow root and writes no styles to the page', async ({ page }) => {
  await page.goto('/tests/e2e/pages/isolation.html')
  await expect(page.locator('.ci-widget-fab')).toBeVisible()

  const structure = await page.evaluate(() => {
    const host = document.querySelector('[data-clearideas-widget-host]')
    return {
      hasShadowRoot: Boolean(host?.shadowRoot),
      widgetInShadow: Boolean(host?.shadowRoot?.querySelector('.ci-widget')),
      widgetInPage: Boolean(document.querySelector('.ci-widget')),
      // The page's own <style> elements are marked; the widget must add none.
      unmarkedStyleElements: [...document.querySelectorAll('style:not([data-page-style])')].length,
      pageAdoptedSheets: document.adoptedStyleSheets.length,
    }
  })
  expect(structure).toEqual({
    hasShadowRoot: true,
    widgetInShadow: true,
    widgetInPage: false,
    unmarkedStyleElements: 0,
    pageAdoptedSheets: 0,
  })
})

test("the widget's wrapper elements take no space in the page, even under hostile CSS", async ({
  page,
}) => {
  await page.goto('/tests/e2e/pages/isolation.html')
  await expect(page.locator('.ci-widget-fab')).toBeVisible()
  const wrappers = await page.evaluate(() =>
    ['#clearideas-widget-container', '[data-clearideas-widget-host]'].map(selector => {
      const element = document.querySelector(selector)!
      const box = element.getBoundingClientRect()
      return {
        tag: element.tagName.toLowerCase(),
        display: getComputedStyle(element).display,
        size: box.width + box.height,
      }
    }),
  )
  // Custom element names: the page's `div { border: … !important }` does not match them.
  expect(wrappers).toEqual([
    { tag: 'clearideas-widget', display: 'contents', size: 0 },
    { tag: 'clearideas-widget-host', display: 'contents', size: 0 },
  ])
})

test('hostile page CSS does not change the widget', async ({ page }) => {
  await page.goto('/tests/e2e/pages/isolation.html')
  await expect(page.locator('.ci-widget-fab')).toBeVisible() // despite button { display: none }

  // Retrying assertions: the button animates from its pre-init grey to the site color.
  const fab = page.locator('.ci-widget-fab')
  await expect(fab).toHaveCSS('background-color', DEMO_ACCENT)
  await expect(fab).toHaveCSS('border-top-width', '0px')
  await expect(fab).toHaveCSS('color', 'rgb(255, 255, 255)')

  await openChatAndSend(page, 'isolation check')
  const text = await computed(page, '.ci-widget-message--assistant .ci-widget-message__text', [
    'font-family',
    'font-size',
    'color',
    'letter-spacing',
    'text-transform',
    'line-height',
  ])
  expect(text['font-family']).not.toContain('Comic Sans')
  expect(text['font-size']).toBe('14px')
  expect(text.color).toBe('rgb(33, 33, 33)')
  expect(text['letter-spacing']).toBe('normal')
  expect(text['text-transform']).toBe('none')
  expect(text['line-height']).toBe('21px')
})

test('widget CSS does not style page elements that share its class names', async ({ page }) => {
  await page.goto('/tests/e2e/pages/isolation.html')
  await expect(page.locator('.ci-widget-fab')).toBeVisible()
  // .ci-widget-message--error and .ci-widget-powered are styled inside the widget (flex, centered);
  // the page's elements keep the page's styles.
  expect(await computed(page, '#page-error', ['display'])).toEqual({ display: 'none' })
  const powered = await page.evaluate(() => {
    const element = document.getElementById('page-powered')!
    return {
      textAlign: getComputedStyle(element).textAlign,
      fontSize: getComputedStyle(element).fontSize,
    }
  })
  // The page's own values (its 5px root font size), not the widget's centered 11px footer style.
  expect(powered).toEqual({ textAlign: 'start', fontSize: '5px' })
})

test('a page can set the accent color and font with CSS variables', async ({ page }) => {
  await page.route(`${API_URL}/public/chat/init`, async route => {
    const response = await route.fetch()
    const body = await response.json()
    delete body.style.color // no server color: the page variable applies
    await route.fulfill({ response, json: body })
  })
  await page.goto('/dev.html?key=demo-public-key')
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--ci-widget-accent', '#0a7d32')
    document.documentElement.style.setProperty('--ci-widget-font-family', 'Georgia, serif')
    ;(window as any).devWidget.destroy()
    ;(window as any).devWidget = (window as any).ClearIdeasWidget.init({
      accessKey: 'demo-public-key',
      apiBaseUrl: (window as any).CHAT_DEV_API_URL, // from /dev-config.js (this runs in the page)
    })
  })
  await expect(page.locator('.ci-widget-fab')).toHaveCSS('background-color', 'rgb(10, 125, 50)')
  await expect(page.locator('.ci-widget')).toHaveCSS('font-family', 'Georgia, serif')
})

test('text on a light accent color stays readable', async ({ page }) => {
  await page.route(`${API_URL}/public/chat/init`, async route => {
    const response = await route.fetch()
    const body = await response.json()
    await route.fulfill({ response, json: { ...body, style: { color: '#ffd400', mode: 'light' } } })
  })
  await page.goto('/dev.html?key=demo-public-key')
  await openChatAndSend(page, 'readable?')
  // Dark text on yellow instead of white.
  await expect(page.locator('.ci-widget-message--user .ci-widget-message__content')).toHaveCSS(
    'color',
    'rgb(33, 33, 33)',
  )
  await expect(page.locator('.ci-widget-fab')).toHaveCSS('color', 'rgb(33, 33, 33)')
  await expect(page.locator('.ci-widget-title-text')).toHaveCSS('color', 'rgb(33, 33, 33)')
})

test('works under a strict Content-Security-Policy without inline styles', async ({ page }) => {
  await page.goto('/tests/e2e/pages/csp.html')
  await expect(page.locator('.ci-widget-fab')).toHaveCSS('background-color', DEMO_ACCENT)
  await expect(page.locator('.ci-widget-fab')).toHaveCSS('border-radius', '50%')

  await openChatAndSend(page, '/fixture markdown')
  await expect(page.locator('.ci-widget-messages h1')).toHaveText('Heading')
  await page.locator('.consumer-input__send').hover()
  await page.evaluate(() => (window as any).testWidget.setDarkMode(true))
  await expect(page.locator('.ci-widget')).toHaveClass(/ci-widget-dark/)

  expect(await page.evaluate(() => (window as any).__cspViolations)).toEqual([])
})

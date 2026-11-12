import { expect, type Page, test } from '@playwright/test'

// The built widget in Chromium against the test server's hostile fixtures (server/README.md).
// dev.html records any payload that manages to run in window.__ciXssHits.

const HOSTILE_REPLIES = ['xss-tooltip', 'xss-links', 'xss-html', 'exfil-image']

async function openChat(page: Page) {
  await page.locator('.ci-widget-fab').click()
  await page.locator('.ci-widget-action--chat').click()
}

async function send(page: Page, text: string) {
  const input = page.locator('.ci-widget-panel textarea')
  await input.fill(text)
  await input.press('Enter')
  await expect(page.locator('.generating-item')).toHaveCount(0)
}

async function xssHits(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as any).__ciXssHits as string[])
}

test('hostile configuration and replies never run script or load remote content', async ({
  page,
}) => {
  const attackerRequests: string[] = []
  page.on('request', request => {
    if (request.url().includes('attacker.example')) attackerRequests.push(request.url())
  })

  await page.goto('/dev.html?key=adversarial-public-key')
  await expect(page.locator('.ci-widget-fab')).toBeVisible()
  // The adversarial site shows its hello bubble immediately.
  await expect(page.locator('.ci-widget-hello-bubble')).toBeVisible()

  await openChat(page)
  // The hostile disclaimer dialog must be dismissed (scrolled) before chatting.
  const dialogButton = page.locator('.ci-widget-disclaimer-dialog__button')
  if (await dialogButton.isVisible()) {
    await page.locator('.ci-widget-disclaimer-dialog__content').evaluate(element => {
      element.scrollTop = element.scrollHeight
      element.dispatchEvent(new Event('scroll'))
    })
    await dialogButton.click()
  }

  for (const fixture of HOSTILE_REPLIES) await send(page, `/fixture ${fixture}`)

  // Nothing from the replies becomes an element that loads content, takes input or overlays the
  // page. (Table cells carry only a text-align style.)
  const messages = page.locator('.ci-widget-messages')
  await expect(messages.locator('img, form, input, iframe, script, object, embed')).toHaveCount(0)
  await expect(messages.locator('.ci-widget-message__text [style]:not(th):not(td)')).toHaveCount(0)
  expect(await xssHits(page)).toEqual([])

  // Hover everything that could carry a tooltip, as a visitor would.
  for (const element of await page
    .locator('.ci-widget-panel a, .ci-widget-panel [data-tooltip]')
    .all()) {
    await element.hover({ timeout: 2000 })
  }
  await page.waitForTimeout(500)

  expect(await xssHits(page)).toEqual([])
  expect(attackerRequests).toEqual([])
  for (const href of await messages
    .locator('a')
    .evaluateAll(links => links.map(link => link.getAttribute('href')))) {
    expect(href).toMatch(/^(https?:|mailto:)/)
  }
})

test('citations open in a new tab without access to the page', async ({ page, context }) => {
  await context.route('https://example.com/**', route =>
    route.fulfill({ contentType: 'text/html', body: '<h1>citation target</h1>' }),
  )
  await page.goto('/dev.html?key=demo-public-key')
  await openChat(page)
  await send(page, '/fixture citations')

  const citation = page.locator('.ci-widget-messages a.chat-source').first()
  await expect(citation).toHaveText('example.com')
  const [popup] = await Promise.all([context.waitForEvent('page'), citation.click()])
  await popup.waitForLoadState()
  expect(popup.url()).toBe('https://example.com/docs')
  expect(await popup.evaluate(() => window.opener)).toBeNull()
})

test('tooltips appear on hover as plain text', async ({ page }) => {
  await page.goto('/dev.html?key=demo-public-key')
  await openChat(page)
  await send(page, '/fixture citations')

  const citation = page.locator('.ci-widget-messages a.chat-source').first()
  await citation.hover()
  await expect
    .poll(() => citation.evaluate(element => getComputedStyle(element, '::after').opacity))
    .toBe('1')
  expect(await citation.evaluate(element => getComputedStyle(element, '::after').content)).toBe(
    '"example.com"',
  )

  const send_ = page.locator('.consumer-input__send')
  await page.locator('.ci-widget-panel textarea').fill('x')
  await send_.hover()
  await expect
    .poll(() => send_.evaluate(element => getComputedStyle(element, '::after').content))
    .toBe('"Send message"')
})

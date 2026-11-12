import { expect, type Page, test } from '@playwright/test'

import { axeViolations } from './helpers/axe'

// Keyboard and screen reader support, and automated checks with axe-core (WCAG 2.1 A/AA rules),
// against the built widget in Chromium.

/** The focused element inside the widget, described as tag.class. */
function focused(page: Page) {
  return page.evaluate(() => {
    const host = document.querySelector('[data-clearideas-widget-host]')
    const active = host?.shadowRoot?.activeElement
    if (!active) return `page:${document.activeElement?.tagName.toLowerCase()}`
    return `${active.tagName.toLowerCase()}.${String(active.className).split(' ')[0]}`
  })
}

async function waitForReply(page: Page) {
  await expect(page.locator('.generating-item')).toHaveCount(0)
}

test.describe('automated accessibility checks (axe-core)', () => {
  test('home view', async ({ page }) => {
    await page.goto('/dev.html?key=demo-public-key')
    await page.locator('.ci-widget-fab').click()
    await expect(page.locator('.ci-widget-action--chat')).toBeVisible()
    expect(await axeViolations(page)).toEqual([])
  })

  test('chat view with Markdown, citations and an error', async ({ page }) => {
    await page.goto('/dev.html?key=demo-public-key')
    await page.locator('.ci-widget-fab').click()
    await page.locator('.ci-widget-action--chat').click()
    const input = page.locator('.ci-widget-panel textarea')
    for (const text of [
      '/fixture markdown',
      '/fixture citations',
      '/fixture error-before-stream',
    ]) {
      await input.fill(text)
      await input.press('Enter')
      await waitForReply(page)
    }
    await expect(page.locator('.ci-widget-message--error')).toBeVisible()
    expect(await axeViolations(page)).toEqual([])
  })

  test('dark mode', async ({ page }) => {
    await page.goto('/dev.html?key=demo-public-key')
    await page.evaluate(() => (window as any).devWidget.setDarkMode(true))
    await page.locator('.ci-widget-fab').click()
    await page.locator('.ci-widget-action--chat').click()
    const input = page.locator('.ci-widget-panel textarea')
    await input.fill('/fixture citations')
    await input.press('Enter')
    await waitForReply(page)
    expect(await axeViolations(page)).toEqual([])
  })

  test('hostile configuration renders accessibly', async ({ page }) => {
    await page.goto('/dev.html?key=adversarial-public-key')
    await page.locator('.ci-widget-fab').click()
    await expect(page.locator('.ci-widget-action--chat')).toBeVisible()
    expect(await axeViolations(page)).toEqual([])
  })
})

test.describe('keyboard', () => {
  test('opens, starts a chat, sends a message and closes without a mouse', async ({ page }) => {
    await page.goto('/dev.html?key=demo-public-key')
    const fab = page.locator('.ci-widget-fab')
    await expect(fab).toHaveAttribute('aria-expanded', 'false')

    await fab.focus()
    await page.keyboard.press('Enter')
    await expect(fab).toHaveAttribute('aria-expanded', 'true')
    // Focus moves into the panel, to the first action.
    await expect.poll(() => focused(page)).toBe('button.ci-widget-action')

    await page.keyboard.press('Enter') // "Chat with …"
    await expect.poll(() => focused(page)).toBe('textarea.consumer-input__textarea')
    await page.keyboard.type('hello from the keyboard')
    await page.keyboard.press('Enter')
    await waitForReply(page)
    await expect(page.locator('.ci-widget-messages')).toContainText(
      'You said: hello from the keyboard',
    )
    // Focus stays in the text box through the reply (it is not disabled while loading).
    expect(await focused(page)).toBe('textarea.consumer-input__textarea')

    await page.keyboard.press('Escape')
    await expect(page.locator('.ci-widget-panel')).toHaveCount(0)
    await expect(fab).toHaveAttribute('aria-expanded', 'false')
    await expect.poll(() => focused(page)).toBe('button.ci-widget-fab')
  })

  test('reaches every home action and header control with Tab', async ({ page }) => {
    await page.goto('/dev.html?key=demo-public-key')
    await page.locator('.ci-widget-fab').focus()
    await page.keyboard.press('Enter')
    await expect.poll(() => focused(page)).toBe('button.ci-widget-action')

    await page.keyboard.press('Tab')
    expect(await focused(page)).toBe('button.ci-widget-action') // the protocol link card
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Shift+Tab')
    expect(await focused(page)).toBe('button.ci-widget-btn-icon') // close, in the header above
  })

  test('closing with the close button returns focus to the launcher', async ({ page }) => {
    await page.goto('/dev.html?key=demo-public-key')
    await page.locator('.ci-widget-fab').focus()
    await page.keyboard.press('Enter')
    await page.locator('.ci-widget-btn-icon').last().focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('.ci-widget-panel')).toHaveCount(0)
    await expect.poll(() => focused(page)).toBe('button.ci-widget-fab')
  })
})

test.describe('screen reader semantics', () => {
  test('panel, conversation log, busy state, alerts and labels', async ({ page }) => {
    await page.goto('/dev.html?key=demo-public-key')
    const fab = page.locator('.ci-widget-fab')
    const panel = page.locator('.ci-widget-panel')
    await fab.click()
    await expect(panel).toHaveAttribute('role', 'dialog')
    await expect(panel).toHaveAttribute('aria-label', 'Ada')
    await expect(fab).toHaveAttribute('aria-controls', (await panel.getAttribute('id'))!)

    await page.locator('.ci-widget-action--chat').click()
    const log = page.locator('.ci-widget-log')
    await expect(log).toHaveAttribute('role', 'log')
    await expect(log).toHaveAttribute('aria-live', 'polite')
    await expect(page.locator('.ci-widget-panel textarea')).toHaveAttribute(
      'aria-label',
      /Ask a question/,
    )

    // While a reply streams the log is busy (announced once complete) and a status is exposed.
    const input = page.locator('.ci-widget-panel textarea')
    await input.fill('/fixture slow')
    await input.press('Enter')
    await expect(log).toHaveAttribute('aria-busy', 'true')
    await expect(page.getByRole('status').filter({ hasText: 'Assistant is typing' })).toHaveCount(1)
    await waitForReply(page)
    await expect(log).toHaveAttribute('aria-busy', 'false')

    // Each message says who wrote it.
    await expect(page.locator('.ci-widget-message--user').first()).toContainText('You said')
    await expect(page.locator('.ci-widget-message--assistant').last()).toContainText(
      'Assistant said',
    )

    await input.fill('/fixture error-before-stream')
    await input.press('Enter')
    await expect(page.getByRole('alert')).toContainText('The assistant is temporarily unavailable.')
  })

  test('decorative icons are hidden from assistive technology', async ({ page }) => {
    await page.goto('/dev.html?key=demo-public-key')
    await page.locator('.ci-widget-fab').click()
    const exposed = await page
      .locator('.ci-widget svg')
      .evaluateAll(svgs => svgs.filter(svg => svg.getAttribute('aria-hidden') !== 'true').length)
    expect(exposed).toBe(0)
  })
})

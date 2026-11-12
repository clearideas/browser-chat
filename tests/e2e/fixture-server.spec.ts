import { expect, type Page, test } from '@playwright/test'

import { API_URL } from './helpers/ports'

// The built widget in a real browser against the local test server (no request mocking), so
// CORS, credentials, cookies and streaming behave as in production.

async function openChat(page: Page) {
  await page.locator('.ci-widget-fab').click()
  await page.locator('.ci-widget-action--chat').click()
}

async function send(page: Page, text: string) {
  const input = page.locator('.ci-widget-panel textarea')
  await input.fill(text)
  await input.press('Enter')
}

test.beforeEach(async ({ page }) => {
  await page.goto('/dev.html?key=demo-public-key')
  await expect(page.locator('.ci-widget-fab')).toBeVisible()
})

test('streams a reply from the test server', async ({ page }) => {
  await openChat(page)
  await send(page, 'hello from playwright')
  await expect(page.locator('.ci-widget-messages')).toContainText('You said: hello from playwright')
})

test('restores the conversation after a reload', async ({ page }) => {
  await openChat(page)
  await send(page, 'remember this')
  await expect(page.locator('.ci-widget-messages')).toContainText('You said: remember this')

  await page.reload()
  await openChat(page)
  await expect(page.locator('.ci-widget-messages')).toContainText('You said: remember this')
})

test('shows the server error message for a failed reply and gives the text back', async ({
  page,
}) => {
  await openChat(page)
  await send(page, '/fixture error-before-stream')
  await expect(page.locator('.ci-widget-message--error')).toContainText(
    'The assistant is temporarily unavailable.',
  )
  // The message was not delivered: it is withdrawn and returned to the input for a retry.
  await expect(page.locator('.ci-widget-message--user')).toHaveCount(0)
  await expect(page.locator('.ci-widget-panel textarea')).toHaveValue(
    '/fixture error-before-stream',
  )
})

test.describe('when the chat is unavailable', () => {
  test('hides the launcher for a site the server refuses', async ({ page }) => {
    const warnings: string[] = []
    page.on('console', message => {
      if (message.type() === 'warning') warnings.push(message.text())
    })
    await page.goto('/dev.html?key=disabled-public-key')
    await expect(page.locator('.ci-widget')).toBeAttached()
    await expect
      .poll(() => warnings.some(text => text.includes('The launcher is hidden')))
      .toBe(true)
    await expect(page.locator('.ci-widget-fab')).toHaveCount(0)
    await expect(page.locator('.ci-widget')).toHaveCSS('pointer-events', 'none')
  })

  test('explains when the server cannot be reached, and retries on the next click', async ({
    page,
  }) => {
    await page.evaluate(() => localStorage.clear())
    await page.route(`${API_URL}/public/chat/init`, route => route.abort())
    await page.reload()
    await page.locator('.ci-widget-fab').click()
    const notice = page.locator('.ci-widget-notice')
    await expect(notice).toHaveText('Chat is unavailable right now. Please try again later.')
    await expect(notice).toHaveAttribute('role', 'alert')
    await expect(page.locator('.ci-widget-panel')).toHaveCount(0)

    await page.unroute(`${API_URL}/public/chat/init`)
    await page.locator('.ci-widget-fab').click()
    await expect(page.locator('.ci-widget-panel')).toBeVisible()
  })
})

test('a site with a hello bubble logs nothing before the visitor interacts', async ({ page }) => {
  const messages: string[] = []
  page.on('console', message => {
    if (message.type() === 'warning' || message.type() === 'error') messages.push(message.text())
  })
  await page.goto('/dev.html?key=adversarial-public-key')
  await expect(page.locator('.ci-widget-hello-bubble')).toBeVisible()
  // Previously the hello bubble sound created an AudioContext without a user gesture.
  expect(messages).toEqual([])
})

// The last assistant message's text (the typing indicator is also an assistant message, without text).
const lastReply = (page: Page) =>
  page.locator('.ci-widget-message--assistant .ci-widget-message__text').last()

test.describe('replies in progress', () => {
  test('the send button becomes a stop button, which keeps the text so far', async ({ page }) => {
    await openChat(page)
    await send(page, '/fixture slow')
    const stop = page.getByRole('button', { name: 'Stop reply' })
    await expect(stop).toBeVisible()
    await expect(lastReply(page)).toContainText('Chunk 1.')
    await stop.focus()
    await page.keyboard.press('Enter')

    await expect(page.getByRole('button', { name: 'Send message' })).toBeVisible()
    await expect(page.locator('.ci-widget-log')).toHaveAttribute('aria-busy', 'false')
    const reply = lastReply(page)
    await expect(reply).toContainText('Chunk 1.')
    await page.waitForTimeout(800) // nothing more arrives after stopping
    await expect(reply).not.toContainText('Chunk 10.')
    await expect(page.locator('.ci-widget-message--error')).toHaveCount(0)
  })

  test('closing the panel does not cancel the reply', async ({ page }) => {
    await openChat(page)
    await send(page, '/fixture slow')
    await expect(lastReply(page)).toContainText('Chunk 1.')
    await page.keyboard.press('Escape')
    await expect(page.locator('.ci-widget-panel')).toHaveCount(0)
    await page.waitForTimeout(3500)
    await page.locator('.ci-widget-fab').click()
    await page.locator('.ci-widget-action--chat').click()
    await expect(lastReply(page)).toContainText('Chunk 10.')
  })
})

test('sends the signed-in user ID, and each user has their own conversation', async ({ page }) => {
  await page.goto('/dev.html?user=zoë')
  await openChat(page)
  await send(page, '/fixture whoami')
  await expect(page.locator('.ci-widget-messages')).toContainText('User ID: zoë (unverified)')

  await page.locator('#user-id').fill('bob')
  await page.locator('#user-id').press('Enter') // submits with Apply (the open panel covers it)
  await expect(page.locator('.ci-widget-messages')).not.toContainText('User ID: zoë')
  await send(page, '/fixture whoami')
  await expect(page.locator('.ci-widget-messages')).toContainText('User ID: bob (unverified)')
})

import type { Page } from '@playwright/test'

export async function mockPublicChat(page: Page) {
  await page.route('https://api.example.test/**', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({
        chatName: 'Demo assistant',
        initialMessage: 'This is a local test fixture.',
        links: [],
        style: { color: '#2866cf', mode: 'system' },
        voiceEnabled: false,
      }),
    }),
  )
}

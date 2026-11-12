import { expect, type Page, test } from '@playwright/test'

import { BUILT_IN_LOCALES, builtInLocales } from '../../src/i18n/locales'

// Language selection (tests/e2e/pages/languages.html) and, for every built-in language, a check
// that a visitor sees no English: neither from the widget nor from the test server.

const LANGUAGES_PAGE = '/tests/e2e/pages/languages.html'

async function widgetLanguage(page: Page) {
  const root = page.locator('.ci-widget')
  return { lang: await root.getAttribute('lang'), dir: await root.getAttribute('dir') }
}

async function setPageLanguage(page: Page, tag: string) {
  await page.locator('#lang').selectOption(tag)
}

test.describe('language selection', () => {
  test('follows the page language from the first render', async ({ page }) => {
    await page.goto(`${LANGUAGES_PAGE}?lang=fr`)
    await expect(page.locator('.ci-widget-fab')).toHaveAttribute('aria-label', 'Ouvrir le chat')
    expect(await widgetLanguage(page)).toEqual({ lang: 'fr', dir: 'ltr' })
  })

  test('switches live, including the open chat and the server greeting', async ({ page }) => {
    await page.goto(`${LANGUAGES_PAGE}?lang=en`)
    await expect(page.locator('.ci-widget-fab')).toHaveAttribute('aria-label', 'Open chat')
    await page.locator('.ci-widget-fab').click()
    await page.locator('.ci-widget-action--chat').click()
    await expect(page.locator('.ci-widget-messages')).toContainText("Hi, I'm Ada")

    await setPageLanguage(page, 'de')
    await expect(page.locator('.ci-widget-panel textarea')).toHaveAttribute(
      'placeholder',
      'Stellen Sie eine Frage...',
    )
    await expect(page.locator('.ci-widget-panel')).toContainText('Hallo, ich bin Ada')

    await setPageLanguage(page, 'ja')
    await expect(page.locator('.ci-widget-panel')).toContainText('こんにちは、Adaです')
  })

  for (const [requested, expected] of [
    ['fr-CA', 'fr'],
    ['pt-BR', 'pt'],
    ['zh-TW', 'zh-Hant'],
    ['zh-CN', 'zh-Hans'],
    ['sv', 'en'],
  ]) {
    test(`uses ${expected} for ${requested}`, async ({ page }) => {
      await page.goto(`${LANGUAGES_PAGE}?lang=${requested}`)
      await expect(page.locator('.ci-widget')).toHaveAttribute('lang', expected)
      await expect(page.locator('.ci-widget-fab')).toHaveAttribute(
        'aria-label',
        builtInLocales[expected].fab.openChat,
      )
    })
  }

  test('custom strings add a language', async ({ page }) => {
    await page.goto(`${LANGUAGES_PAGE}?lang=sv`)
    await expect(page.locator('.ci-widget-fab')).toHaveAttribute('aria-label', 'Open chat')
    await page.getByRole('button', { name: 'Add Swedish strings' }).click()
    await expect(page.locator('.ci-widget-fab')).toHaveAttribute('aria-label', 'Öppna chatten')
    await expect(page.locator('.ci-widget')).toHaveAttribute('lang', 'sv')
    // Strings the custom locale leaves out fall back to English.
    await page.locator('.ci-widget-fab').click()
    await expect(page.locator('.ci-widget-powered')).toHaveText('Powered by Clear Ideas®')
  })
})

test.describe('without a page language', () => {
  test.use({ locale: 'pt-BR' })

  test("uses the browser's language", async ({ page }) => {
    await page.goto(`${LANGUAGES_PAGE}?lang=none`)
    expect(await page.evaluate(() => document.documentElement.hasAttribute('lang'))).toBe(false)
    await expect(page.locator('.ci-widget')).toHaveAttribute('lang', 'pt')
    await expect(page.locator('.ci-widget-fab')).toHaveAttribute('aria-label', 'Abrir chat')
  })
})

test.describe('right-to-left layout', () => {
  test('mirrors the panel for Arabic and keeps English text and code left to right', async ({
    page,
  }) => {
    await page.goto('/dev.html?lang=ar')
    expect(await widgetLanguage(page)).toEqual({ lang: 'ar', dir: 'rtl' })
    await page.locator('.ci-widget-fab').click()
    await page.locator('.ci-widget-action--chat').click()
    const input = page.locator('.ci-widget-panel textarea')
    await input.fill('مرحبا')
    await input.press('Enter')
    await expect(page.locator('.ci-widget-message--assistant').last()).toContainText('قلت')

    // The visitor's message sits on the left, the assistant's on the right.
    const user = await page
      .locator('.ci-widget-message--user .ci-widget-message__content')
      .boundingBox()
    const assistant = await page
      .locator('.ci-widget-message--assistant .ci-widget-message__content')
      .last()
      .boundingBox()
    expect(user!.x).toBeLessThan(assistant!.x)

    // Arrows point the other way.
    await expect(page.locator('.ci-widget-icon--mirror svg').first()).toHaveCSS(
      'transform',
      'matrix(-1, 0, 0, 1, 0, 0)',
    )
    // The empty input keeps the panel direction (placeholder on the right).
    await expect(input).toHaveCSS('direction', 'rtl')

    await input.fill('/fixture markdown')
    await input.press('Enter')
    await expect(page.locator('.ci-widget-message__text pre')).toHaveCSS('direction', 'ltr')
    // The Arabic greeting reads right to left, the English Markdown reply left to right.
    await expect(page.locator('.ci-widget-message__text p').first()).toHaveCSS('direction', 'rtl')
    await expect(page.locator('.ci-widget-message__text p', { hasText: 'Some bold' })).toHaveCSS(
      'direction',
      'ltr',
    )
  })
})

// ---------------------------------------------------------------------------------------------
// No English leaks: the same visit in every language.
// ---------------------------------------------------------------------------------------------

/** Every text node and accessible text attribute inside the widget. */
async function visibleStrings(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const shadow = document.querySelector('[data-clearideas-widget-host]')?.shadowRoot
    if (!shadow) return []
    const strings: string[] = []
    const walker = document.createTreeWalker(shadow, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent?.trim()
      if (text && !node.parentElement?.closest('style')) strings.push(text)
    }
    for (const element of shadow.querySelectorAll('*')) {
      for (const name of ['aria-label', 'title', 'placeholder', 'data-tooltip', 'alt']) {
        const value = element.getAttribute(name)?.trim()
        if (value) strings.push(value)
      }
    }
    return strings
  })
}

async function waitForReply(page: Page) {
  await expect(page.locator('.ci-widget-log')).toHaveAttribute('aria-busy', 'false')
}

/** A visit: launcher, home, chat, a reply and a failed reply. Returns every string shown. */
async function visit(page: Page, lang: string): Promise<Set<string>> {
  const seen = new Set<string>()
  const collect = async () => (await visibleStrings(page)).forEach(text => seen.add(text))
  await page.goto(`/dev.html?lang=${lang}`)
  await expect(page.locator('.ci-widget-fab')).toBeVisible()
  await collect()
  await page.locator('.ci-widget-fab').click()
  await expect(page.locator('.ci-widget-action--chat')).toBeVisible()
  await collect()
  await page.locator('.ci-widget-action--chat').click()
  await expect(page.locator('.ci-widget-disclaimer')).toBeVisible()
  await collect()
  const input = page.locator('.ci-widget-panel textarea')
  await input.fill('12345')
  await input.press('Enter')
  await waitForReply(page)
  await expect(page.locator('.ci-widget-new-chat-btn')).toBeVisible()
  await collect()
  await input.fill('/fixture error-before-stream')
  await input.press('Enter')
  await expect(page.locator('.ci-widget-message--error')).toBeVisible()
  await collect()
  return seen
}

/** Strings that are the same in English and the given language by design. */
function sameInBothLanguages(lang: string): Set<string> {
  const same = new Set(['12345', 'Ada', '/fixture help', '/fixture error-before-stream'])
  const english = builtInLocales.en as Record<string, Record<string, string>>
  const other = builtInLocales[lang] as Record<string, Record<string, string>>
  for (const [section, keys] of Object.entries(english)) {
    for (const [key, value] of Object.entries(keys)) {
      if (other[section][key] === value) same.add(value)
    }
  }
  return same
}

test.describe('no English in other languages', () => {
  test.describe.configure({ mode: 'serial' })
  let english: Set<string>

  test('English visit', async ({ page }) => {
    english = await visit(page, 'en')
    // The visit covers widget and server text.
    for (const text of [
      'Open chat',
      'Local test server',
      'Powered by Clear Ideas®',
      'You said: 12345',
    ]) {
      expect(english).toContain(text)
    }
  })

  for (const lang of BUILT_IN_LOCALES.filter(tag => tag !== 'en')) {
    test(`${lang} visit shows no English`, async ({ page }) => {
      const seen = await visit(page, lang)
      const allowed = sameInBothLanguages(lang)
      const leaks = [...seen].filter(text => english.has(text) && !allowed.has(text))
      expect(leaks).toEqual([])
      await expect(page.locator('.ci-widget')).toHaveAttribute('lang', lang)
    })
  }
})

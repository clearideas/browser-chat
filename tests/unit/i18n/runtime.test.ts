import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import {
  createWidgetI18n,
  startWidgetLocaleTracking,
  stopWidgetLocaleTracking,
} from '../../../src/i18n/runtime'

afterEach(() => {
  stopWidgetLocaleTracking()
  document.documentElement.lang = 'en'
  vi.restoreAllMocks()
})

describe('createWidgetI18n', () => {
  it('follows the page language until a locale is set', async () => {
    document.documentElement.lang = 'de-CH'
    startWidgetLocaleTracking()
    const i18n = createWidgetI18n()
    expect(i18n.locale.value).toBe('de')
    expect(i18n.t('fab.openChat')).toBe('Chat öffnen')

    document.documentElement.lang = 'ja'
    await nextTick() // the MutationObserver runs asynchronously
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(i18n.locale.value).toBe('ja')

    i18n.setLocale('es-MX')
    expect(i18n.locale.value).toBe('es')
    i18n.setLocale(undefined)
    expect(i18n.locale.value).toBe('ja')
  })

  it("uses the browser's languages when the page declares none", () => {
    document.documentElement.removeAttribute('lang')
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['sv-SE', 'nl-BE', 'en'])
    startWidgetLocaleTracking()
    expect(createWidgetI18n().locale.value).toBe('nl')
  })

  it('fills in placeholders and leaves unknown ones alone', () => {
    const i18n = createWidgetI18n()
    i18n.setLocale('en')
    expect(i18n.t('header.greeting', { name: 'Ada' })).toBe('Hi Ada')
    expect(i18n.t('header.greeting')).toBe('Hi {name}')
    expect(i18n.t('header.greeting', { other: 1 })).toBe('Hi {name}')
    expect(i18n.t('no.such.key')).toBe('no.such.key')
  })

  it('isolates inserted values in right-to-left text', () => {
    const i18n = createWidgetI18n()
    i18n.setLocale('ar')
    expect(i18n.t('header.greeting', { name: 'Ada' })).toBe('مرحبًا \u2068Ada\u2069')
    i18n.setLocale('fr')
    expect(i18n.t('header.greeting', { name: 'Ada' })).toBe('Bonjour Ada')
  })

  it('gives right-to-left direction for Arabic', () => {
    const i18n = createWidgetI18n()
    i18n.setLocale('ar')
    expect(i18n.dir.value).toBe('rtl')
    i18n.setLocale('fr')
    expect(i18n.dir.value).toBe('ltr')
  })
})

describe('custom messages', () => {
  it('adds a locale, falling back to English for missing strings', () => {
    const i18n = createWidgetI18n()
    i18n.setMessages({ sv: { fab: { openChat: 'Öppna chatten' } } })
    i18n.setLocale('sv-SE')
    expect(i18n.locale.value).toBe('sv')
    expect(i18n.t('fab.openChat')).toBe('Öppna chatten')
    expect(i18n.t('fab.closeChat')).toBe('Close chat')
  })

  it('overrides built-in strings', () => {
    const i18n = createWidgetI18n()
    i18n.setMessages({ fr: { chat: { poweredBy: 'Fourni par Exemple' } } })
    i18n.setLocale('fr')
    expect(i18n.t('chat.poweredBy')).toBe('Fourni par Exemple')
    expect(i18n.t('fab.openChat')).toBe('Ouvrir le chat')
  })

  it('falls back from a custom regional locale to the built-in language', () => {
    const i18n = createWidgetI18n()
    i18n.setMessages({ 'fr-CA': { input: { placeholder: 'Posez votre question...' } } })
    i18n.setLocale('fr-CA')
    expect(i18n.locale.value).toBe('fr-CA')
    expect(i18n.t('input.placeholder')).toBe('Posez votre question...')
    expect(i18n.t('fab.openChat')).toBe('Ouvrir le chat')
  })

  it('ignores values that are not strings', () => {
    const i18n = createWidgetI18n()
    i18n.setMessages({ en: { fab: { openChat: 42 as unknown as string } } })
    i18n.setLocale('en')
    expect(i18n.t('fab.openChat')).toBe('Open chat')
    i18n.setMessages(null)
    expect(i18n.t('fab.openChat')).toBe('Open chat')
  })
})

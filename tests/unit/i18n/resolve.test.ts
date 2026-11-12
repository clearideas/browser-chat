import { describe, expect, it } from 'vitest'

import { BUILT_IN_LOCALES } from '../../../src/i18n/locales'
import { localeDirection, resolveLocale } from '../../../src/i18n/resolve'

describe('resolveLocale', () => {
  it.each([
    ['en', 'en'],
    ['fr', 'fr'],
    ['FR', 'fr'],
    ['fr-CA', 'fr'],
    ['fr_CA', 'fr'],
    ['pt-BR', 'pt'],
    ['pt-PT', 'pt'],
    ['de-AT', 'de'],
    ['es-419', 'es'],
    ['zh', 'zh-Hans'],
    ['zh-CN', 'zh-Hans'],
    ['zh-SG', 'zh-Hans'],
    ['zh-Hans', 'zh-Hans'],
    ['zh-Hans-HK', 'zh-Hans'],
    ['zh-TW', 'zh-Hant'],
    ['zh-HK', 'zh-Hant'],
    ['zh-MO', 'zh-Hant'],
    ['zh-Hant', 'zh-Hant'],
    ['zh-hant-tw', 'zh-Hant'],
    ['ja-JP', 'ja'],
    ['ko-KR', 'ko'],
    ['ar-EG', 'ar'],
    ['sv', 'en'],
    ['', 'en'],
    ['   ', 'en'],
    ['not a tag', 'en'],
  ])('%j → %s', (requested, expected) => {
    expect(resolveLocale(requested, BUILT_IN_LOCALES)).toBe(expected)
  })

  it('takes the first supported language of a list', () => {
    expect(resolveLocale(['sv-SE', 'sv', 'de-CH', 'en'], BUILT_IN_LOCALES)).toBe('de')
    expect(resolveLocale(['sv', null, undefined], BUILT_IN_LOCALES)).toBe('en')
    expect(resolveLocale(null, BUILT_IN_LOCALES)).toBe('en')
  })

  it('prefers an exact regional locale when one is available', () => {
    expect(resolveLocale('fr-CA', [...BUILT_IN_LOCALES, 'fr-CA'])).toBe('fr-CA')
    expect(resolveLocale('fr-ca', [...BUILT_IN_LOCALES, 'fr-CA'])).toBe('fr-CA')
    expect(resolveLocale('fr-FR', [...BUILT_IN_LOCALES, 'fr-CA'])).toBe('fr')
  })
})

describe('localeDirection', () => {
  it.each([
    ['ar', 'rtl'],
    ['ar-EG', 'rtl'],
    ['he', 'rtl'],
    ['fa-IR', 'rtl'],
    ['ur', 'rtl'],
    ['en', 'ltr'],
    ['fr-CA', 'ltr'],
    ['zh-Hant', 'ltr'],
    ['', 'ltr'],
  ])('%s is %s', (locale, direction) => {
    expect(localeDirection(locale)).toBe(direction)
  })
})

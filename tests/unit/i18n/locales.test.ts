// The built-in translations: complete, with the same placeholders as English, and translated.

import { describe, expect, it } from 'vitest'

import { BUILT_IN_LOCALES, builtInLocales } from '../../../src/i18n/locales'
import en from '../../../src/i18n/locales/en'

const entries = (messages: object) =>
  Object.entries(messages).flatMap(([section, keys]) =>
    Object.entries(keys as Record<string, string>).map(([key, value]) => [
      `${section}.${key}`,
      value,
    ]),
  )
const placeholders = (text: string) =>
  [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort()

// Words that are the same in English and some other languages.
const SAME_AS_ENGLISH = new Set(['OK', 'Live', 'Conversation', 'Image'])

const englishEntries = entries(en)
const translated = BUILT_IN_LOCALES.filter(locale => locale !== 'en')

describe('built-in locales', () => {
  it('include the expected languages', () => {
    expect(BUILT_IN_LOCALES).toEqual([
      'en',
      'fr',
      'es',
      'de',
      'it',
      'pt',
      'nl',
      'pl',
      'ja',
      'ko',
      'zh-Hans',
      'zh-Hant',
      'ar',
    ])
  })

  it.each(translated)('%s has exactly the English keys', locale => {
    const keys = entries(builtInLocales[locale]).map(([key]) => key)
    expect(keys).toEqual(englishEntries.map(([key]) => key))
  })

  it.each(translated)('%s keeps the placeholders and has no empty strings', locale => {
    const messages = Object.fromEntries(entries(builtInLocales[locale]))
    for (const [key, english] of englishEntries) {
      expect(messages[key].trim(), key).not.toBe('')
      expect(placeholders(messages[key]), key).toEqual(placeholders(english))
    }
  })

  it.each(translated)('%s translates every string', locale => {
    const messages = Object.fromEntries(entries(builtInLocales[locale]))
    const untranslated = englishEntries
      .filter(([key, english]) => messages[key] === english && !SAME_AS_ENGLISH.has(english))
      .map(([key]) => key)
    expect(untranslated).toEqual([])
  })

  it('keeps the registered trademark in branded strings', () => {
    for (const locale of BUILT_IN_LOCALES) {
      expect(builtInLocales[locale].chat.poweredBy, locale).toContain('Clear Ideas®')
      expect(builtInLocales[locale].chat.defaultName, locale).toContain('Clear Ideas®')
    }
  })

  it('writes French with accents and no-break spaces before double punctuation', () => {
    const french = entries(builtInLocales.fr).map(([, value]) => value)
    const text = french.join('\n')
    for (const word of ['Démarrer', 'Écoute', 'clé', 'Propulsé', 'réessayez', 'défiler']) {
      expect(text).toContain(word)
    }
    for (const value of french) expect(value, value).not.toMatch(/ [?:!;]/)
  })
})

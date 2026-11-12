import { computed, type ComputedRef, inject, type InjectionKey, provide, ref } from 'vue'

import { builtInLocales } from './locales'
import { FALLBACK_LOCALE, localeDirection, resolveLocale } from './resolve'
import type { WidgetMessageOverrides, WidgetMessages, WidgetMessagesOption } from './types'

/**
 * The languages the page asks for: `<html lang>`, or the browser's languages when the page does
 * not declare one. Page state, shared by all widgets and observed while at least one is mounted.
 */
function readDocumentLanguages(): string[] {
  if (typeof document === 'undefined') return []
  const lang = document.documentElement.lang.trim()
  if (lang) return [lang]
  if (typeof navigator === 'undefined') return []
  if (navigator.languages?.length) return [...navigator.languages]
  return navigator.language ? [navigator.language] : []
}

const documentLanguages = ref<string[]>(readDocumentLanguages())
let localeObserver: MutationObserver | null = null
let activeLocaleConsumers = 0

export function startWidgetLocaleTracking() {
  if (typeof document === 'undefined') return
  activeLocaleConsumers += 1
  if (!localeObserver) {
    localeObserver = new MutationObserver(syncDocumentLanguages)
    localeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['lang'],
    })
  }
  syncDocumentLanguages()
}

export function stopWidgetLocaleTracking() {
  if (activeLocaleConsumers > 0) activeLocaleConsumers -= 1
  if (activeLocaleConsumers === 0 && localeObserver) {
    localeObserver.disconnect()
    localeObserver = null
  }
}

function syncDocumentLanguages() {
  const next = readDocumentLanguages()
  if (next.join() !== documentLanguages.value.join()) documentLanguages.value = next
}

export interface WidgetI18n {
  /**
   * The widget's locale, a key of the built-in or custom locales (for example `fr` or `zh-Hant`):
   * the best match for the locale set for this widget, otherwise for the page language.
   */
  locale: ComputedRef<string>
  /** Text direction of the locale. */
  dir: ComputedRef<'ltr' | 'rtl'>
  t: (key: string, params?: Record<string, string | number>) => string
  /** Sets this widget's locale (any BCP 47 tag); null or undefined follows the page again. */
  setLocale: (value?: string | null) => void
  /** Sets this widget's custom messages (see WidgetMessagesOption). */
  setMessages: (messages?: WidgetMessagesOption | null) => void
}

/** Creates the locale state of one widget instance. */
export function createWidgetI18n(): WidgetI18n {
  const requestedLocale = ref<string | null>(null)
  const customMessages = ref<WidgetMessagesOption>({})

  const available = computed(() => [
    ...new Set([...Object.keys(builtInLocales), ...Object.keys(customMessages.value)]),
  ])
  const locale = computed(() =>
    resolveLocale(requestedLocale.value ?? documentLanguages.value, available.value),
  )
  const dir = computed(() => localeDirection(locale.value))

  /** Dictionaries to look a key up in, in order. */
  const chain = computed(() => {
    const custom = customMessages.value
    const language = locale.value.split('-')[0]
    const dictionaries: (WidgetMessages | WidgetMessageOverrides | undefined)[] = [
      custom[locale.value],
      builtInLocales[locale.value],
    ]
    // A custom regional locale such as `fr-CA` falls back to the built-in language first.
    if (language !== locale.value) dictionaries.push(custom[language], builtInLocales[language])
    dictionaries.push(custom[FALLBACK_LOCALE], builtInLocales[FALLBACK_LOCALE])
    return dictionaries.filter(Boolean) as (WidgetMessages | WidgetMessageOverrides)[]
  })

  return {
    locale,
    dir,
    t: (key, params) => translate(chain.value, key, params, dir.value === 'rtl'),
    setLocale(value) {
      requestedLocale.value = value?.trim() ? value : null
    },
    setMessages(messages) {
      customMessages.value = messages && typeof messages === 'object' ? messages : {}
    },
  }
}

const I18N_KEY: InjectionKey<WidgetI18n> = Symbol('clearideas-widget-i18n')
let standaloneI18n: WidgetI18n | null = null

/** Called by the widget root: gives the widget and its child components their own locale. */
export function provideWidgetI18n(): WidgetI18n {
  const i18n = createWidgetI18n()
  provide(I18N_KEY, i18n)
  return i18n
}

/** Locale of the enclosing widget (components rendered on their own share a default). */
export function useWidgetI18n(): WidgetI18n {
  return inject(I18N_KEY, null) ?? (standaloneI18n ??= createWidgetI18n())
}

/**
 * Looks a key up and fills in `{name}` placeholders. In right-to-left text, values are wrapped in
 * Unicode isolates (U+2068…U+2069) so a left-to-right name cannot reorder the sentence around it.
 */
function translate(
  dictionaries: readonly (WidgetMessages | WidgetMessageOverrides)[],
  key: string,
  params: Record<string, string | number> | undefined,
  isolate: boolean,
): string {
  const [section, name] = key.split('.')
  let raw = key
  for (const dictionary of dictionaries) {
    const value = (dictionary as Record<string, Record<string, unknown> | undefined>)[section]?.[
      name
    ]
    if (typeof value === 'string') {
      raw = value
      break
    }
  }
  if (!params) return raw
  return raw.replace(/\{(\w+)\}/g, (match, token) =>
    token in params ? (isolate ? `\u2068${params[token]}\u2069` : String(params[token])) : match,
  )
}

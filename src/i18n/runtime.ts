import { computed, ref } from 'vue'

import { type WidgetLocale, widgetMessages } from './messages'

const FALLBACK_LOCALE: WidgetLocale = 'en'
let localeObserver: MutationObserver | null = null
let activeLocaleConsumers = 0

export function resolveWidgetLocale(value?: string | null): WidgetLocale {
  if (!value) return FALLBACK_LOCALE

  const normalized = value.toLowerCase()
  if (normalized === 'fr' || normalized.startsWith('fr-')) return 'fr'

  return 'en'
}

export function getDocumentLocale(): WidgetLocale {
  if (typeof document === 'undefined') return FALLBACK_LOCALE

  return resolveWidgetLocale(document.documentElement.lang)
}

const documentLocale = ref<WidgetLocale>(getDocumentLocale())
const explicitLocale = ref<WidgetLocale | null>(null)
const currentLocale = computed<WidgetLocale>(() => explicitLocale.value ?? documentLocale.value)

export function setWidgetLocale(value?: string | null) {
  explicitLocale.value = value == null ? null : resolveWidgetLocale(value)
  updateWidgetLocaleDebug('setWidgetLocale', value)
}

export function startWidgetLocaleTracking() {
  if (typeof document === 'undefined') return

  activeLocaleConsumers += 1

  if (!localeObserver) {
    localeObserver = new MutationObserver(() => {
      syncDocumentLocale('document-lang-changed')
    })

    localeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['lang'],
    })
  }

  syncDocumentLocale('runtime-start')
}

export function stopWidgetLocaleTracking() {
  if (activeLocaleConsumers > 0) {
    activeLocaleConsumers -= 1
  }

  if (activeLocaleConsumers === 0 && localeObserver) {
    localeObserver.disconnect()
    localeObserver = null
  }
}

export function useWidgetI18n() {
  function t(key: string, params?: Record<string, string | number>): string {
    const dictionary = widgetMessages[currentLocale.value] ?? widgetMessages[FALLBACK_LOCALE]
    const fallbackDictionary = widgetMessages[FALLBACK_LOCALE]
    const raw = getNestedValue(dictionary, key) ?? getNestedValue(fallbackDictionary, key) ?? key

    if (!params) return raw

    return raw.replace(/\{(\w+)\}/g, (_, token) => String(params[token] ?? `{${token}}`))
  }

  return {
    locale: currentLocale,
    t,
    setLocale: setWidgetLocale,
  }
}

function syncDocumentLocale(reason: string) {
  documentLocale.value = getDocumentLocale()
  updateWidgetLocaleDebug(reason)
}

function updateWidgetLocaleDebug(reason: string, requestedLocale?: string | null) {
  if (typeof window === 'undefined') return
  ;(window as any).__ClearIdeasWidgetLocaleDebug = {
    reason,
    requestedLocale: requestedLocale ?? null,
    documentLang: typeof document === 'undefined' ? null : document.documentElement.lang,
    documentLocale: documentLocale.value,
    explicitLocale: explicitLocale.value,
    currentLocale: currentLocale.value,
    timestamp: new Date().toISOString(),
  }
}

function getNestedValue(value: Record<string, unknown>, key: string): string | undefined {
  const result = key.split('.').reduce<unknown>((acc, segment) => {
    if (!acc || typeof acc !== 'object') return undefined
    return (acc as Record<string, unknown>)[segment]
  }, value)

  return typeof result === 'string' ? result : undefined
}

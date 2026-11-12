// Matching a requested language (a BCP 47 tag such as `fr-CA` or `zh-TW`) to an available locale.

export const FALLBACK_LOCALE = 'en'

// Languages written right to left (their primary language subtag).
const RTL_LANGUAGES = new Set(['ar', 'ckb', 'dv', 'fa', 'he', 'ps', 'sd', 'ug', 'ur', 'yi'])
// Regions that use Traditional Chinese when no script is given.
const TRADITIONAL_CHINESE_REGIONS = new Set(['tw', 'hk', 'mo'])

/** Lowercased subtags of a language tag (`pt_BR` → `['pt', 'br']`); empty for blank input. */
function subtags(tag: string): string[] {
  return tag.trim().replace(/_/g, '-').toLowerCase().split('-').filter(Boolean)
}

/**
 * Candidate locale keys for one requested tag, most specific first. Chinese is matched by script:
 * `zh-TW`, `zh-HK` and `zh-Hant` are Traditional, other Chinese tags Simplified.
 */
function candidates(tag: string): string[] {
  const parts = subtags(tag)
  if (!parts.length) return []
  const result: string[] = []
  for (let end = parts.length; end > 0; end--) result.push(parts.slice(0, end).join('-'))
  if (parts[0] === 'zh') {
    const traditional =
      parts.includes('hant') ||
      (!parts.includes('hans') && parts.some(part => TRADITIONAL_CHINESE_REGIONS.has(part)))
    result.splice(result.length - 1, 0, traditional ? 'zh-hant' : 'zh-hans')
  }
  return result
}

/**
 * The best available locale for the requested tags (tried in order), or English. Matching ignores
 * case and falls back from a regional tag to its language: `fr-CA` uses `fr` unless `fr-CA` exists.
 * Returns the key as written in `available`.
 */
export function resolveLocale(
  requested: string | readonly (string | null | undefined)[] | null | undefined,
  available: readonly string[],
): string {
  const byLowercase = new Map(available.map(key => [key.toLowerCase(), key]))
  const tags = typeof requested === 'string' ? [requested] : (requested ?? [])
  for (const tag of tags) {
    if (!tag) continue
    for (const candidate of candidates(tag)) {
      const match = byLowercase.get(candidate)
      if (match) return match
    }
  }
  return FALLBACK_LOCALE
}

/** Text direction of a locale. */
export function localeDirection(locale: string): 'ltr' | 'rtl' {
  const language = subtags(locale)[0] ?? ''
  return RTL_LANGUAGES.has(language) ? 'rtl' : 'ltr'
}

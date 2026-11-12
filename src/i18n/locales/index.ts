// Built-in locales, keyed by language tag. Add a locale by creating a file like fr.ts (typed as
// WidgetMessages, so the compiler reports missing or unknown keys) and listing it here.
import type { WidgetMessages } from '../types'
import ar from './ar'
import de from './de'
import en from './en'
import es from './es'
import fr from './fr'
import it from './it'
import ja from './ja'
import ko from './ko'
import nl from './nl'
import pl from './pl'
import pt from './pt'
import zhHans from './zh-Hans'
import zhHant from './zh-Hant'

export const builtInLocales: Record<string, WidgetMessages> = {
  en,
  fr,
  es,
  de,
  it,
  pt,
  nl,
  pl,
  ja,
  ko,
  'zh-Hans': zhHans,
  'zh-Hant': zhHant,
  ar,
}

/** Tags of the built-in locales. */
export const BUILT_IN_LOCALES = Object.keys(builtInLocales)

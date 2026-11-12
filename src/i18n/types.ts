import type en from './locales/en'

/** Every widget string, grouped by area. English (`locales/en.ts`) defines the keys. */
export type WidgetMessages = {
  [Section in keyof typeof en]: Record<keyof (typeof en)[Section], string>
}

/**
 * Strings for a custom locale or overrides for a built-in one, passed as the `messages` option.
 * Missing strings fall back to the built-in locale of the same language, then to English.
 */
export type WidgetMessageOverrides = {
  [Section in keyof WidgetMessages]?: Partial<WidgetMessages[Section]>
}

/** Custom messages by locale tag, for example `{ sv: {...}, fr: { chat: { poweredBy: '…' } } }`. */
export type WidgetMessagesOption = Record<string, WidgetMessageOverrides>

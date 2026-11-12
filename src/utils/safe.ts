// Validation for values that come from the server or from message content. The protocol treats all
// of them as untrusted (docs/protocol/README.md §7.1).

const WEB_PROTOCOLS = new Set(['http:', 'https:'])
const LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

function parseAbsoluteUrl(value: unknown): URL | null {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    return new URL(value.trim())
  } catch {
    return null
  }
}

/** Returns the URL if it is an absolute http(s) URL, otherwise null. */
export function safeWebUrl(value: unknown): string | null {
  const url = parseAbsoluteUrl(value)
  return url && WEB_PROTOCOLS.has(url.protocol) ? url.href : null
}

/** Returns the URL if it is an absolute http(s) or mailto URL, otherwise null. */
export function safeLinkUrl(value: unknown): string | null {
  const url = parseAbsoluteUrl(value)
  return url && LINK_PROTOCOLS.has(url.protocol) ? url.href : null
}

/** Host name without a leading `www.`, for citation labels and tooltips. */
export function displayHost(value: string): string {
  const url = parseAbsoluteUrl(value)
  return url ? url.hostname.replace(/^www\./, '') : ''
}

/** Opens an http(s) URL in a new tab without giving it access to this page. */
export function openExternal(value: unknown): boolean {
  const url = safeWebUrl(value)
  if (!url || typeof window === 'undefined') return false
  window.open(url, '_blank', 'noopener,noreferrer')
  return true
}

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i
const RGB_COLOR = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i

/** Returns the color if it is `#rgb`, `#rrggbb` or `rgb(r, g, b)`, otherwise null. */
export function safeColor(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const color = value.trim()
  if (HEX_COLOR.test(color)) return color
  const rgb = RGB_COLOR.exec(color)
  if (rgb && rgb.slice(1).every(channel => Number(channel) <= 255)) return color
  return null
}

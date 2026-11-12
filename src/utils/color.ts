// Color helpers for the widget accent color. Inputs are already validated (utils/safe.ts safeColor)
// or come from the widget itself: `#rgb`, `#rrggbb` or `rgb(r, g, b)`.

export interface Rgb {
  r: number
  g: number
  b: number
}

export function parseColor(color: string): Rgb | null {
  const value = color.trim()
  const rgb = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i.exec(value)
  if (rgb) return { r: +rgb[1], g: +rgb[2], b: +rgb[3] }
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value)
  if (!hex) return null
  const digits = hex[1].length === 3 ? [...hex[1]].map(d => d + d).join('') : hex[1]
  return {
    r: parseInt(digits.slice(0, 2), 16),
    g: parseInt(digits.slice(2, 4), 16),
    b: parseInt(digits.slice(4, 6), 16),
  }
}

const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value)))

export const rgbString = ({ r, g, b }: Rgb) => `rgb(${r}, ${g}, ${b})`

/** "r, g, b", for rgba(var(--ci-widget-accent-rgb), alpha) in CSS. */
export const rgbChannels = ({ r, g, b }: Rgb) => `${r}, ${g}, ${b}`

/** Adds `amount` (-255..255) to each channel: positive lightens, negative darkens. */
export function shiftColor(color: Rgb, amount: number): Rgb {
  return { r: clamp(color.r + amount), g: clamp(color.g + amount), b: clamp(color.b + amount) }
}

export function withAlpha(color: string, alpha: number): string {
  const rgb = parseColor(color)
  return rgb ? `rgba(${rgbChannels(rgb)}, ${alpha})` : color
}

/** WCAG relative luminance. */
function luminance({ r, g, b }: Rgb): number {
  const [rs, gs, bs] = [r, g, b].map(channel => {
    const value = channel / 255
    return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

const WHITE: Rgb = { r: 255, g: 255, b: 255 }
const DARK_TEXT: Rgb = { r: 33, g: 33, b: 33 }

/** White or near-black, whichever is more readable on `background`. */
export function readableTextOn(background: Rgb): string {
  return contrastRatio(WHITE, background) >= contrastRatio(DARK_TEXT, background)
    ? rgbString(WHITE)
    : rgbString(DARK_TEXT)
}

/** Message and panel surfaces the accent is used on as a text color (light and dark themes). */
const LIGHT_SURFACE: Rgb = { r: 255, g: 255, b: 255 }
const DARK_SURFACE: Rgb = { r: 31, g: 31, b: 31 }

/**
 * The accent, darkened (on light surfaces) or lightened (on dark ones) just enough to reach `ratio`
 * contrast, for accent-colored text such as links. Unchanged if it already contrasts enough.
 */
export function readableAccentOn(accent: Rgb, surface: Rgb, ratio = 4.5): Rgb {
  const step = luminance(surface) > 0.5 ? -8 : 8
  let color = accent
  for (let index = 0; index < 40 && contrastRatio(color, surface) < ratio; index += 1) {
    color = shiftColor(color, step)
  }
  return color
}

export interface AccentPalette {
  /** The accent color. */
  base: string
  /** "r, g, b" channels of the accent. */
  channels: string
  /** Darker shade for hover/pressed states and gradient ends. */
  strong: string
  /** Lighter shade. */
  soft: string
  /** Text or icon color on top of the accent. */
  onAccent: string
  /** Accent for text (links, citations) on the light and dark surfaces. */
  textOnLight: string
  textOnDark: string
}

export function accentPalette(color: string, fallback = '#ED613F'): AccentPalette {
  const rgb = parseColor(color) ?? parseColor(fallback)!
  return {
    base: rgbString(rgb),
    channels: rgbChannels(rgb),
    strong: rgbString(shiftColor(rgb, -20)),
    soft: rgbString(shiftColor(rgb, 30)),
    onAccent: readableTextOn(rgb),
    textOnLight: rgbString(readableAccentOn(rgb, LIGHT_SURFACE)),
    textOnDark: rgbString(readableAccentOn(rgb, DARK_SURFACE)),
  }
}

/** CSS custom properties set on the widget root; component styles use these for the accent. */
export function accentVariables(palette: AccentPalette, dark = false): Record<string, string> {
  return {
    '--ci-widget-accent-text': dark ? palette.textOnDark : palette.textOnLight,
    '--ci-widget-accent': palette.base,
    '--ci-widget-accent-rgb': palette.channels,
    '--ci-widget-accent-strong': palette.strong,
    '--ci-widget-accent-soft': palette.soft,
    '--ci-widget-on-accent': palette.onAccent,
  }
}

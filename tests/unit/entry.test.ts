import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { init } from '@/entry'
import type { WidgetInstance } from '@/types'

import { expectConsole } from '../helpers/console-guard'

const CSS_REGISTRY = Symbol.for('clearideas.chat.css')
const TEST_CSS = '.ci-widget-test-rule { color: red; }'
let widget: WidgetInstance | null = null

beforeAll(() => {
  // The build registers the bundle's CSS under this key (vite.config.ts); simulate it.
  ;(globalThis as any)[CSS_REGISTRY] = { test: TEST_CSS } // __WIDGET_VERSION__ is 'test' in Vitest
})

afterEach(() => {
  widget?.destroy()
  widget = null
  document.body.innerHTML = ''
})

const baseConfig = { accessKey: 'test-access-key', apiBaseUrl: 'https://api.clearideas.local' }

/** Waits until the widget has loaded its configuration (the FAB takes the site color). */
async function waitForInit(root: ParentNode) {
  await vi.waitFor(
    () => {
      const fab = root.querySelector('.ci-widget-fab') as HTMLElement | null
      expect(fab?.style.backgroundColor).toBe('rgb(40, 102, 207)')
    },
    { timeout: 5000 },
  )
}

const shadowOf = () => document.querySelector('[data-clearideas-widget-host]')!.shadowRoot!

/** CSS text applied to a document or shadow root (adopted sheets, or <style> fallback). */
function appliedCss(target: Document | ShadowRoot): string {
  const adopted = ((target as any).adoptedStyleSheets ?? []) as CSSStyleSheet[]
  const fromSheets = adopted.flatMap(sheet => [...sheet.cssRules].map(rule => rule.cssText))
  const fromElements = [...target.querySelectorAll('style')].map(style => style.textContent ?? '')
  return [...fromSheets, ...fromElements].join('\n')
}

describe('init mounting', () => {
  it('renders in an open shadow root and applies its CSS only there', async () => {
    widget = init(baseConfig)
    await waitForInit(shadowOf())

    const container = document.getElementById('clearideas-widget-container')!
    const host = container.querySelector('[data-clearideas-widget-host]')!
    expect(host.shadowRoot).not.toBeNull()
    expect(host.shadowRoot!.querySelector('.ci-widget')).not.toBeNull()
    expect(document.querySelector('.ci-widget')).toBeNull()

    expect(appliedCss(host.shadowRoot!)).toContain('ci-widget-test-rule')
    expect(appliedCss(host.shadowRoot!)).toMatch(/:host/)
    expect(appliedCss(document)).toBe('')
  })

  it('does not pass init options to the component as HTML attributes', async () => {
    widget = init({
      ...baseConfig,
      hasConsent: true,
      throwOnMissingConsent: false,
      shadowDom: true,
    })
    const root = document
      .querySelector('[data-clearideas-widget-host]')!
      .shadowRoot!.querySelector('.ci-widget')!
    for (const attribute of ['container', 'hasconsent', 'throwonmissingconsent', 'shadowdom']) {
      expect(root.hasAttribute(attribute), attribute).toBe(false)
    }
  })

  it('renders in the page DOM with shadowDom: false', async () => {
    widget = init({ ...baseConfig, shadowDom: false })
    await waitForInit(document)
    const host = document.querySelector('[data-clearideas-widget-host]')!
    expect(host.shadowRoot).toBeNull()
    expect(host.querySelector('.ci-widget')).not.toBeNull()
    expect(appliedCss(document)).toContain('ci-widget-test-rule')
  })

  it('mounts into a given container and leaves it in place on destroy', async () => {
    const container = document.createElement('section')
    container.id = 'chat-slot'
    document.body.appendChild(container)

    widget = init({ ...baseConfig, container: '#chat-slot' })
    await waitForInit(shadowOf())
    expect(container.querySelector('[data-clearideas-widget-host]')?.shadowRoot).not.toBeNull()

    widget.destroy()
    widget = null
    expect(document.getElementById('chat-slot')).not.toBeNull()
    expect(container.querySelector('[data-clearideas-widget-host]')).toBeNull()
  })

  it('removes the container it created on destroy, even while still loading', () => {
    widget = init(baseConfig) // destroyed before /init completes: the request is aborted
    expect(document.getElementById('clearideas-widget-container')).not.toBeNull()
    widget.destroy()
    widget = null
    expect(document.getElementById('clearideas-widget-container')).toBeNull()
  })
})

describe('instance ownership', () => {
  const slot = (id: string) => {
    const element = document.createElement('div')
    element.id = id
    document.body.appendChild(element)
    return element
  }
  const hostIn = (element: Element) => element.querySelector('[data-clearideas-widget-host]')

  it('keeps widgets in different containers independent', async () => {
    const slotA = slot('slot-a')
    const slotB = slot('slot-b')
    const a = init({ ...baseConfig, container: slotA })
    const b = init({ ...baseConfig, container: slotB })
    await waitForInit(hostIn(slotA)!.shadowRoot!)
    await waitForInit(hostIn(slotB)!.shadowRoot!)
    expect(hostIn(slotA)).not.toBeNull() // the second init did not remove the first widget

    a.destroy()
    expect(hostIn(slotA)).toBeNull()
    expect(hostIn(slotB)).not.toBeNull() // destroying one handle leaves the other widget alone
    b.destroy()
  })

  it('replaces the widget when init() is called again for the same container', async () => {
    const first = init(baseConfig)
    await waitForInit(shadowOf())
    widget = init(baseConfig) // for example after login
    await waitForInit(shadowOf())
    expect(document.querySelectorAll('[data-clearideas-widget-host]')).toHaveLength(1)

    first.destroy() // the replaced handle no longer controls anything
    expect(document.querySelectorAll('[data-clearideas-widget-host]')).toHaveLength(1)
  })

  it('ignores calls on a destroyed handle', async () => {
    expectConsole('warn', /open\(\) called on a destroyed widget/)
    expectConsole('warn', /sendMessage\(\) called on a destroyed widget/)
    const handle = init(baseConfig)
    await waitForInit(shadowOf())
    handle.destroy()
    handle.destroy() // idempotent
    expect(() => handle.open()).not.toThrow()
    await expect(handle.sendMessage('hello')).resolves.toBeUndefined()
  })

  it('gives each widget its own locale', async () => {
    const slotA = slot('slot-a')
    const slotB = slot('slot-b')
    const a = init({ ...baseConfig, container: slotA })
    const b = init({ ...baseConfig, container: slotB })
    await waitForInit(hostIn(slotA)!.shadowRoot!)
    await waitForInit(hostIn(slotB)!.shadowRoot!)

    a.setLocale('fr')
    await vi.waitFor(() =>
      expect(
        hostIn(slotA)!.shadowRoot!.querySelector('.ci-widget-fab')!.getAttribute('aria-label'),
      ).toBe('Ouvrir le chat'),
    )
    expect(
      hostIn(slotB)!.shadowRoot!.querySelector('.ci-widget-fab')!.getAttribute('aria-label'),
    ).toBe('Open chat')
    a.destroy()
    b.destroy()
  })

  it('removes its page listeners when destroyed', async () => {
    const added = new Set<EventListenerOrEventListenerObject>()
    const addSpy = vi.spyOn(document, 'addEventListener')
    const removeSpy = vi.spyOn(document, 'removeEventListener')
    widget = init(baseConfig)
    await waitForInit(shadowOf())
    for (const call of addSpy.mock.calls) if (call[1]) added.add(call[1])
    expect(added.size).toBeGreaterThan(0)

    widget.destroy()
    widget = null
    const removed = new Set(removeSpy.mock.calls.map(call => call[1]))
    for (const listener of added) expect(removed.has(listener)).toBe(true)
  })
})

// The real widget component talking to the real test server over HTTP.
// Covers the protocol as the widget uses it today; security rendering tests come with the UI work.

import type { VueWrapper } from '@vue/test-utils'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import type { WidgetProps } from '@/types'

import { type ChatServer, createChatServer, createDemoSite } from '../../server/index.ts'
import { expectConsole } from '../helpers/console-guard'
import { createWidgetWrapper, widgetStorageKey } from '../helpers/test-utils'

// Generous timeout for slow or busy machines; waits end as soon as the condition holds.
const WAIT = { timeout: 5000 }
let server: ChatServer
let wrapper: VueWrapper<any> | null = null

beforeAll(async () => {
  server = createChatServer({
    rateLimits: { messagesPerWindow: 10_000, authFailuresPerWindow: 10_000 },
  })
  await server.listen(0)
})

afterAll(async () => {
  await server.close()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

async function mountWidget(props: Partial<WidgetProps> = {}) {
  wrapper = createWidgetWrapper({
    apiBaseUrl: server.url,
    accessKey: 'demo-public-key',
    ...props,
  })
  const vm = wrapper.vm as any
  await vi.waitFor(() => expect(vm.initData).toBeTruthy(), WAIT)
  return vm
}

async function openChat(vm: any) {
  await vm.openChatDirectly()
  await nextTick()
}

function assistantMessages(vm: any): string[] {
  return vm.messages
    .filter((message: { role: string }) => message.role === 'assistant')
    .map((message: { content: string }) => message.content)
}

function renderedMessages(): string {
  return document.querySelector('.ci-widget-messages')?.textContent ?? ''
}

describe('widget against the test server', () => {
  it('loads configuration, opens, and renders a streamed reply', async () => {
    const vm = await mountWidget()
    expect(vm.initData.protocolVersion).toBe(1)
    expect(vm.initData.chatName).toBe('Ada')

    await openChat(vm)
    expect(
      localStorage.getItem(widgetStorageKey('session', server.url, 'demo-public-key')),
    ).toBeTruthy()

    await vm.sendPublicChatMessage('Hello live server')
    await nextTick()
    expect(vm.error).toBeNull()
    expect(vm.chatId).toMatch(/^[0-9a-f]{24}$/)
    expect(assistantMessages(vm)).toEqual(['You said: Hello live server'])
    expect(renderedMessages()).toContain('You said: Hello live server')
  })

  it('restores the conversation for a returning visitor and continues it', async () => {
    const first = await mountWidget()
    await openChat(first)
    await first.sendPublicChatMessage('first question')
    const chatId = first.chatId
    wrapper!.unmount()

    const second = await mountWidget()
    await openChat(second)
    expect(second.chatId).toBe(chatId)
    expect(second.messages.map((message: { content: string }) => message.content)).toEqual(
      expect.arrayContaining(['first question', 'You said: first question']),
    )

    await second.sendPublicChatMessage('second question')
    expect(second.chatId).toBe(chatId)
    expect(assistantMessages(second)).toContain('You said: second question')
  })

  it('keeps the session ID in sessionStorage while consent is pending', async () => {
    const vm = await mountWidget({ consentRequired: true, consentGranted: false })
    await openChat(vm)
    expect(
      sessionStorage.getItem(widgetStorageKey('session', server.url, 'demo-public-key')),
    ).toBeTruthy()
    expect(
      localStorage.getItem(widgetStorageKey('session', server.url, 'demo-public-key')),
    ).toBeNull()
  })

  it('uses the French greeting when the widget locale is French', async () => {
    const vm = await mountWidget({ locale: 'fr' })
    expect(vm.initData.initialMessage).toMatch(/^Bonjour/)
  })
})

describe('widget handling of fixture scenarios', () => {
  it('reassembles events split across network chunks', async () => {
    const vm = await mountWidget()
    await openChat(vm)
    await vm.sendPublicChatMessage('/fixture split-frames')
    expect(assistantMessages(vm)).toEqual([
      'Split frames with multi-byte text: café, 日本語, emoji 🎉 done.',
    ])
  })

  it.each(['compact', 'multiline', 'crlf', 'fields', 'no-blank-lines'])(
    'parses "%s" Server-Sent Events framing',
    async format => {
      const vm = await mountWidget()
      await openChat(vm)
      await vm.sendPublicChatMessage(`/fixture sse-${format}`)
      expect(vm.error).toBeNull()
      expect(assistantMessages(vm)).toEqual([`Framed as ${format}: line one\nline two.`])
    },
  )

  it('ignores keep-alive comments', async () => {
    const vm = await mountWidget()
    await openChat(vm)
    await vm.sendPublicChatMessage('/fixture keepalive')
    expect(assistantMessages(vm)).toEqual(['Reply with keep-alive comments in between.'])
  })

  it('replaces streamed text with the finalized message', async () => {
    const vm = await mountWidget()
    await openChat(vm)
    await vm.sendPublicChatMessage('/fixture final-rewrite')
    expect(assistantMessages(vm)).toEqual(['Final text from message_finalized.'])
  })

  it('ignores thinking and tool call events', async () => {
    const vm = await mountWidget()
    await openChat(vm)
    await vm.sendPublicChatMessage('/fixture thinking-tools')
    expect(vm.error).toBeNull()
    expect(assistantMessages(vm)).toEqual(['Here is the answer after using a tool.'])
  })

  it('shows the error body message when the reply fails before streaming', async () => {
    expectConsole(
      'error',
      /Request failed: ServerMessageError: The assistant is temporarily unavailable/,
    )
    const vm = await mountWidget()
    await openChat(vm)
    await vm.sendPublicChatMessage('/fixture error-before-stream')
    expect(vm.error).toBe('The assistant is temporarily unavailable.')
    expect(vm.messages).toEqual([])
    // The undelivered text goes back into the input for a retry.
    expect(vm.chatInputContent).toBe('/fixture error-before-stream')
  })

  it('shows a stream error and drops the partial reply', async () => {
    const vm = await mountWidget()
    await openChat(vm)
    await vm.sendPublicChatMessage('/fixture error-mid-stream')
    expect(vm.error).toBe('The assistant stopped unexpectedly.')
    expect(assistantMessages(vm)).toEqual([])
  })

  it('keeps partial text when the stream ends without done', async () => {
    const vm = await mountWidget()
    await openChat(vm)
    await vm.sendPublicChatMessage('/fixture end-without-done')
    expect(vm.error).toBeNull()
    expect(assistantMessages(vm)).toEqual(['Partial answer, then a clean end of stream.'])
  })

  it('reports an error and drops the partial reply when the connection fails', async () => {
    // The server drops the socket mid-stream; fetch rejects (undici reports "terminated").
    expectConsole('error', /Request failed: \[?TypeError/)
    expectConsole('warn', /Network error/)
    const vm = await mountWidget()
    await openChat(vm)
    await vm.sendPublicChatMessage('/fixture disconnect')
    expect(vm.error).toBe(
      "Couldn't reach the chat service. Please check your connection and try again.",
    )
    expect(assistantMessages(vm)).toEqual([])
  })

  it('hides the launcher for a disabled site (403 on init)', async () => {
    expectConsole('warn', /Init request failed: 403 Forbidden\. The launcher is hidden/)
    expectConsole('warn', /Cannot open widget: initialization failed/)
    wrapper = createWidgetWrapper({ apiBaseUrl: server.url, accessKey: 'disabled-public-key' })
    const vm = wrapper.vm as any
    await vi.waitFor(() => expect(vm.loadingInit).toBe(false), WAIT)
    expect(vm.initData).toBeNull()
    await nextTick()
    expect(document.querySelector('.ci-widget-fab')).toBeNull()
    await vm.openWidget()
    expect(vm.isOpen).toBe(false)
    // Nothing the visitor can fix, so no notice either.
    await nextTick()
    expect(document.querySelector('.ci-widget-notice')).toBeNull()
  })

  it('keeps the launcher and explains when the server is unreachable', async () => {
    expectConsole('error', /Failed to load init data: \[?TypeError/)
    expectConsole('warn', /Cannot open widget: initialization failed/)
    const closed = createChatServer()
    const unreachableUrl = await closed.listen(0)
    await closed.close()
    wrapper = createWidgetWrapper({
      apiBaseUrl: unreachableUrl,
      accessKey: 'demo-public-key',
      locale: 'de',
    })
    const vm = wrapper.vm as any
    await vi.waitFor(() => expect(vm.loadingInit).toBe(false), WAIT)
    await nextTick()
    expect(document.querySelector('.ci-widget-fab')).not.toBeNull()

    await vm.openWidget()
    await nextTick()
    expect(vm.isOpen).toBe(false)
    const notice = document.querySelector('.ci-widget-notice')
    expect(notice?.getAttribute('role')).toBe('alert')
    expect(notice?.textContent?.trim()).toBe(
      'Der Chat ist derzeit nicht verfügbar. Bitte versuchen Sie es später erneut.',
    )
    expect(document.querySelector('.ci-widget-fab')).not.toBeNull()
  })
})

describe('signed-in user ID', () => {
  it('sends the user ID to the server, percent-encoded', async () => {
    const vm = await mountWidget({ userId: 'zoë@example.com' })
    await openChat(vm)
    await vm.sendPublicChatMessage('/fixture whoami')
    expect(assistantMessages(vm)).toEqual(['User ID: `zoë@example.com` (unverified)'])
  })

  it('gives each user their own conversation, also while the panel is open', async () => {
    const vm = await mountWidget({ userId: 'alice' })
    await openChat(vm)
    await vm.sendPublicChatMessage('question from alice')
    expect(assistantMessages(vm)).toContain('You said: question from alice')

    vm.setUserId('bob')
    await vi.waitFor(() => expect(vm.messages).toEqual([]), WAIT)
    await vm.sendPublicChatMessage('/fixture whoami')
    expect(assistantMessages(vm)).toEqual(['User ID: `bob` (unverified)'])

    vm.setUserId('alice')
    await vi.waitFor(
      () => expect(assistantMessages(vm)).toContain('You said: question from alice'),
      WAIT,
    )
    expect(assistantMessages(vm)).not.toContain('User ID: `bob` (unverified)')

    vm.setUserId(undefined) // signed out
    await vi.waitFor(() => expect(vm.messages).toEqual([]), WAIT)
  }, 15_000)

  it('does not send an over-long user ID', async () => {
    expectConsole('warn', /userId is longer than 256 characters and is not sent/)
    const vm = await mountWidget({ userId: 'x'.repeat(300) })
    await openChat(vm)
    await vm.sendPublicChatMessage('/fixture whoami')
    expect(assistantMessages(vm)).toEqual(['No user ID was sent.'])
  })
})

describe('stopping, stalled replies and closing the panel', () => {
  it('stop keeps the text received so far, and the chat continues', async () => {
    const vm = await mountWidget()
    await openChat(vm)
    const sending = vm.sendPublicChatMessage('/fixture slow')
    await vi.waitFor(() => expect(vm.streamingContent.length).toBeGreaterThan(0), WAIT)
    await nextTick()
    // The send button is a stop button while the reply streams.
    const stop = document.querySelector<HTMLButtonElement>('.consumer-input__stop')
    expect(stop?.getAttribute('aria-label')).toBe('Stop reply')
    stop!.click()
    await sending

    const replies = assistantMessages(vm)
    expect(replies).toHaveLength(1)
    expect(replies[0].length).toBeGreaterThan(0)
    expect(replies[0]).not.toContain('Chunk 10') // stopped before the end
    expect(vm.error).toBeNull()
    expect(vm.loading).toBe(false)
    await nextTick()
    expect(document.querySelector('.consumer-input__stop')).toBeNull()

    await vm.sendPublicChatMessage('after stop')
    expect(assistantMessages(vm).at(-1)).toBe('You said: after stop')
  })

  it('stop before any output keeps the message, without an error', async () => {
    const vm = await mountWidget()
    await openChat(vm)
    const sending = vm.sendPublicChatMessage('/fixture stall')
    await new Promise(resolve => setTimeout(resolve, 100))
    vm.stopReply()
    await sending
    expect(vm.messages.map((message: { role: string }) => message.role)).toEqual(['user'])
    expect(vm.error).toBeNull()
    expect(vm.loading).toBe(false)
  })

  it('gives up on a reply that never starts, keeping the message', async () => {
    expectConsole('warn', /No reply data for the reply timeout/)
    const vm = await mountWidget({ replyTimeoutMs: 300 })
    await openChat(vm)
    await vm.sendPublicChatMessage('/fixture stall')
    expect(vm.error).toBe('The assistant is taking too long to respond. Please try again.')
    expect(vm.messages.map((message: { role: string }) => message.role)).toEqual(['user'])
    expect(vm.loading).toBe(false)
  })

  it('gives up on a reply that goes silent, dropping the partial text', async () => {
    expectConsole('warn', /No reply data for the reply timeout/)
    const vm = await mountWidget({ replyTimeoutMs: 300 })
    await openChat(vm)
    await vm.sendPublicChatMessage('/fixture stall-mid-stream')
    expect(vm.error).toBe('The assistant is taking too long to respond. Please try again.')
    expect(assistantMessages(vm)).toEqual([])
  })

  it('does not time out while data keeps arriving', async () => {
    // Ten chunks 300 ms apart take about 3 s, longer than the timeout, which restarts per chunk.
    const vm = await mountWidget({ replyTimeoutMs: 1000 })
    await openChat(vm)
    await vm.sendPublicChatMessage('/fixture slow')
    expect(vm.error).toBeNull()
    expect(assistantMessages(vm)[0]).toContain('Chunk 10')
  }, 15_000)

  it('closing the panel does not cancel the reply', async () => {
    const vm = await mountWidget()
    await openChat(vm)
    const sending = vm.sendPublicChatMessage('/fixture slow')
    await vi.waitFor(() => expect(vm.streamingContent.length).toBeGreaterThan(0), WAIT)
    vm.closeWidget()
    await sending
    expect(vm.isOpen).toBe(false)
    expect(assistantMessages(vm)[0]).toContain('Chunk 10')
  }, 15_000)
})

describe('dark mode', () => {
  const root = document.documentElement
  const isDark = () => wrapper!.element.classList.contains('ci-widget-dark')
  const flush = async () => {
    await new Promise(resolve => setTimeout(resolve, 0)) // MutationObserver callbacks
    await nextTick()
  }

  afterEach(() => {
    root.className = ''
    root.removeAttribute('data-theme')
  })

  it('follows the page theme live (the demo site uses the system mode)', async () => {
    await mountWidget()
    expect(isDark()).toBe(false)
    root.classList.add('dark')
    await flush()
    expect(isDark()).toBe(true)
    root.classList.remove('dark')
    root.setAttribute('data-theme', 'dark')
    await flush()
    expect(isDark()).toBe(true)
    root.setAttribute('data-theme', 'light')
    await flush()
    expect(isDark()).toBe(false)
  })

  it('re-reads a darkMode function when the page theme changes', async () => {
    let appDark = false
    await mountWidget({ darkMode: () => appDark })
    expect(isDark()).toBe(false)
    appDark = true
    root.setAttribute('data-theme', 'anything') // a theme switch the widget can observe
    await flush()
    expect(isDark()).toBe(true)
  })

  it("uses the server's mode, and the system preference when it sends none", async () => {
    const demo = createDemoSite()
    const themed = createChatServer({
      sites: [
        { ...demo, accessKey: 'no-mode-key', id: 'no-mode', style: { color: '#2866cf' } },
        { ...demo, accessKey: 'dark-key', id: 'dark', style: { color: '#2866cf', mode: 'dark' } },
      ],
    })
    const url = await themed.listen(0)
    const originalMatchMedia = window.matchMedia
    window.matchMedia = ((query: string) => ({
      matches: query.includes('dark'),
      addEventListener() {},
      removeEventListener() {},
    })) as unknown as typeof window.matchMedia
    try {
      await mountWidget({ apiBaseUrl: url, accessKey: 'no-mode-key' })
      expect(isDark()).toBe(true) // no mode: the protocol default "system"
      wrapper!.unmount()

      root.classList.add('light') // a light page does not override the site's forced dark mode
      await mountWidget({ apiBaseUrl: url, accessKey: 'dark-key' })
      expect(isDark()).toBe(true)
    } finally {
      window.matchMedia = originalMatchMedia
      await themed.close()
    }
  })

  it('lets setDarkMode() override the page', async () => {
    const vm = await mountWidget()
    root.classList.add('dark')
    await flush()
    vm.setDarkMode(false)
    await nextTick()
    expect(isDark()).toBe(false)
  })
})

describe('widget in other languages', () => {
  it('shows server content and replies in the widget language', async () => {
    const vm = await mountWidget({ locale: 'fr-CA' })
    expect(vm.initData.chatTagline).toBe('Serveur de test local')
    await openChat(vm)
    await vm.sendPublicChatMessage('Bonjour')
    expect(assistantMessages(vm)).toEqual(['Vous avez dit\u00a0: Bonjour'])

    await vm.sendPublicChatMessage('/fixture error-mid-stream')
    expect(vm.error).toBe("L'assistant s'est arrêté de manière inattendue.")
  })

  it('marks the widget with its language and direction', async () => {
    const vm = await mountWidget({ locale: 'ar' })
    const root = wrapper!.element as HTMLElement
    expect(root.getAttribute('lang')).toBe('ar')
    expect(root.getAttribute('dir')).toBe('rtl')
    vm.setLocale('zh-TW')
    await nextTick()
    expect(root.getAttribute('lang')).toBe('zh-Hant')
    expect(root.getAttribute('dir')).toBe('ltr')
  })
})

describe('widget security against hostile server data', () => {
  const XSS_PROBE = '__ciXss'
  // Elements hostile content must never produce. The widget's own icons are SVGs inside
  // .ci-widget-icon, so SVG is checked separately.
  const BLOCKED = 'img, script, iframe, form, input, style, object, embed'

  function expectNoInjectedElements(root: ParentNode) {
    expect(root.querySelector(BLOCKED)).toBeNull()
    for (const svg of root.querySelectorAll('svg')) {
      expect(svg.closest('.ci-widget-icon'), 'svg outside the widget icons').not.toBeNull()
    }
    expect(root.querySelector('[onerror], [onload], [data-tippy-content]')).toBeNull()
  }

  afterEach(() => {
    delete (window as any)[XSS_PROBE]
  })

  function expectSafeLinks(root: ParentNode) {
    for (const link of root.querySelectorAll('a')) {
      expect(link.getAttribute('href')).toMatch(/^(https?:|mailto:)/)
      expect(link.getAttribute('rel')).toContain('noopener')
    }
  }

  it.each(['xss-tooltip', 'xss-links', 'xss-html', 'exfil-image', 'xss-all'])(
    'renders the %s reply inertly',
    async fixture => {
      const vm = await mountWidget()
      await openChat(vm)
      await vm.sendPublicChatMessage(`/fixture ${fixture}`)
      await nextTick()

      const messages = document.querySelector('.ci-widget-messages')!
      expect(messages.querySelectorAll('.ci-widget-message--assistant').length).toBeGreaterThan(0)
      expectNoInjectedElements(messages)
      for (const text of messages.querySelectorAll('.ci-widget-message__text')) {
        expect(text.querySelector('svg')).toBeNull()
      }
      expectSafeLinks(messages)
      expect((window as any)[XSS_PROBE]).toBeUndefined()
    },
  )

  it('treats visitor-typed HTML and Markdown as text', async () => {
    const vm = await mountWidget()
    await openChat(vm)
    const typed = '<img src=x onerror="window.__ciXss=1"> [x](javascript:alert(1))'
    await vm.sendPublicChatMessage(typed)
    await nextTick()

    const userMessage = document.querySelector('.ci-widget-message--user')!
    expect(userMessage.textContent).toContain(typed)
    expect(userMessage.querySelector('img, a')).toBeNull()
  })

  it('sanitizes hostile site configuration', async () => {
    expectConsole('warn', /Ignored link with an unsupported URL/)
    const vm = await mountWidget({ accessKey: 'adversarial-public-key' })

    // Script-bearing URLs and CSS are dropped before use.
    expect(vm.initData.iconUrl).toBeUndefined()
    expect(vm.initData.style.color).toBeUndefined()
    expect(vm.initData.links.map((link: { url: string }) => link.url)).toEqual([
      'https://example.com/',
    ])

    await vm.openWidget()
    await nextTick()
    const panel = document.querySelector('.ci-widget-panel')!
    expectNoInjectedElements(panel)
    expect(panel.textContent).toContain('<img src=x onerror=') // shown as text

    // A link action with an unsafe URL (for example from setActions) is not opened.
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    vm.setActions([
      { id: 'bad', title: 'Bad', description: '', type: 'link', url: 'javascript:alert(1)' },
    ])
    await nextTick()
    ;(document.querySelectorAll('.ci-widget-action')[0] as HTMLElement).click()
    expect(open).not.toHaveBeenCalled()

    await openChat(vm)
    const messages = document.querySelector('.ci-widget-messages')!
    expectNoInjectedElements(messages)
    expectSafeLinks(messages)
    expect((window as any)[XSS_PROBE]).toBeUndefined()
  })

  it('opens safe link actions in a new tab without opener access', async () => {
    const vm = await mountWidget()
    await vm.openWidget()
    await nextTick()
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    ;(document.querySelectorAll('.ci-widget-action')[1] as HTMLElement).click()
    expect(open).toHaveBeenCalledWith(
      'https://github.com/clearideas/chat/blob/main/docs/protocol/README.md',
      '_blank',
      'noopener,noreferrer',
    )
  })

  it('keeps sessions and cached configuration separate per site', async () => {
    const demo = await mountWidget()
    await openChat(demo)
    await demo.sendPublicChatMessage('demo site question')
    wrapper!.unmount()

    // Same page, different site: nothing from the demo site is reused or sent.
    const other = await mountWidget({ accessKey: 'adversarial-public-key' })
    await openChat(other)
    expect(other.initData.chatName).toContain('Hostile Bot')
    expect(other.sessionId).not.toBe(demo.sessionId)
    expect(other.messages).toEqual([])

    expect(localStorage.getItem(widgetStorageKey('session', server.url, 'demo-public-key'))).toBe(
      demo.sessionId,
    )
    expect(
      localStorage.getItem(widgetStorageKey('session', server.url, 'adversarial-public-key')),
    ).toBe(other.sessionId)
  })

  it('adopts a session ID stored by widget 0.1.x under the old key', async () => {
    // An earlier visit with the old widget.
    const first = await mountWidget()
    await openChat(first)
    await first.sendPublicChatMessage('from the old widget')
    const sessionId = first.sessionId
    wrapper!.unmount()
    localStorage.clear()
    localStorage.setItem('clearideasPublicChatSessionId', sessionId)

    const upgraded = await mountWidget()
    await openChat(upgraded)
    expect(upgraded.sessionId).toBe(sessionId)
    expect(upgraded.messages.map((message: { content: string }) => message.content)).toContain(
      'from the old widget',
    )
    expect(localStorage.getItem('clearideasPublicChatSessionId')).toBeNull()
  })
})

describe('widget without browser storage', () => {
  const originals = {
    local: Object.getOwnPropertyDescriptor(window, 'localStorage'),
    session: Object.getOwnPropertyDescriptor(window, 'sessionStorage'),
  }

  afterEach(() => {
    Object.defineProperty(window, 'localStorage', originals.local!)
    Object.defineProperty(window, 'sessionStorage', originals.session!)
  })

  it('chats normally when storage access throws (blocked cookies, sandboxed iframes)', async () => {
    const denied = () => {
      throw new DOMException('The operation is insecure.', 'SecurityError')
    }
    Object.defineProperty(window, 'localStorage', { configurable: true, get: denied })
    Object.defineProperty(window, 'sessionStorage', { configurable: true, get: denied })

    const vm = await mountWidget()
    await openChat(vm)
    await vm.sendPublicChatMessage('first')
    const chatId = vm.chatId
    await vm.sendPublicChatMessage('second')

    // The session lives in memory, so the conversation continues in the same chat.
    expect(vm.sessionId).toBeTruthy()
    expect(vm.chatId).toBe(chatId)
    expect(vm.error).toBeNull()
    expect(assistantMessages(vm)).toEqual(['You said: first', 'You said: second'])
  })
})

import { afterEach, beforeEach, describe, expect, it, type MockedFunction, vi } from 'vitest'

import type { WidgetConfig, WidgetInstance } from '@/types'
import { autoInitializeFromDataAttributes } from '@/utils/auto-init'

describe('autoInitializeFromDataAttributes', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })
  beforeEach(() => {
    document.body.innerHTML = ''
    vi.clearAllMocks()
  })

  it('does not initialize if document is undefined', () => {
    const initFn = vi.fn()
    // Temporarily remove document
    vi.stubGlobal('document', undefined)

    autoInitializeFromDataAttributes(initFn as any)
    expect(initFn).not.toHaveBeenCalled()
  })

  it('initializes widget from data attributes', () => {
    const initFn = vi.fn((_config: WidgetConfig) => ({
      open: vi.fn(),
      close: vi.fn(),
      toggle: vi.fn(),
      sendMessage: vi.fn(),
      hide: vi.fn(),
      show: vi.fn(),
      openChatDirectly: vi.fn(),
      setDarkMode: vi.fn(),
      setConsentRequired: vi.fn(),
      setConsentGranted: vi.fn(),
      setPosition: vi.fn(),
      setWidth: vi.fn(),
      setHeight: vi.fn(),
      setTop: vi.fn(),
      setRight: vi.fn(),
      setBottom: vi.fn(),
      setLeft: vi.fn(),
      setFabSize: vi.fn(),
      setActions: vi.fn(),
      setUserName: vi.fn(),
      setUserEmail: vi.fn(),
      setUserId: vi.fn(),
      setLocale: vi.fn(),
      setMessages: vi.fn(),
      stopReply: vi.fn(),
      destroy: vi.fn(),
    })) as (config: WidgetConfig) => WidgetInstance

    const element = document.createElement('div')
    element.setAttribute('data-clearideas-widget', '')
    element.setAttribute('data-access-key', 'test-key-123')
    element.setAttribute('data-api-base-url', 'https://api.test.com')
    element.setAttribute('data-position', 'bottom-left')
    element.setAttribute('data-width', '400')
    element.setAttribute('data-height', '600')
    element.setAttribute('data-open-on-load', 'true')
    document.body.appendChild(element)

    autoInitializeFromDataAttributes(initFn)

    // Trigger DOMContentLoaded
    const event = new Event('DOMContentLoaded')
    document.dispatchEvent(event)

    expect(initFn).toHaveBeenCalledTimes(1)
    const config = (initFn as MockedFunction<(config: WidgetConfig) => WidgetInstance>).mock
      .calls[0][0]
    expect(config.accessKey).toBe('test-key-123')
    expect(config.apiBaseUrl).toBe('https://api.test.com')
    expect(config.position).toBe('bottom-left')
    expect(config.width).toBe(400)
    expect(config.height).toBe(600)
    expect(config.openOnLoad).toBe(true)
    expect(config.container).toBe(element)
  })

  it('handles absolute positioning attributes', () => {
    const initFn = vi.fn((_config: WidgetConfig) => ({
      open: vi.fn(),
      close: vi.fn(),
      toggle: vi.fn(),
      sendMessage: vi.fn(),
      hide: vi.fn(),
      show: vi.fn(),
      openChatDirectly: vi.fn(),
      setDarkMode: vi.fn(),
      setConsentRequired: vi.fn(),
      setConsentGranted: vi.fn(),
      setPosition: vi.fn(),
      setWidth: vi.fn(),
      setHeight: vi.fn(),
      setTop: vi.fn(),
      setRight: vi.fn(),
      setBottom: vi.fn(),
      setLeft: vi.fn(),
      setFabSize: vi.fn(),
      setActions: vi.fn(),
      setUserName: vi.fn(),
      setUserEmail: vi.fn(),
      setUserId: vi.fn(),
      setLocale: vi.fn(),
      setMessages: vi.fn(),
      stopReply: vi.fn(),
      destroy: vi.fn(),
    })) as (config: WidgetConfig) => WidgetInstance

    const element = document.createElement('div')
    element.setAttribute('data-clearideas-widget', '')
    element.setAttribute('data-access-key', 'test-key')
    element.setAttribute('data-top', '10')
    element.setAttribute('data-right', '20')
    element.setAttribute('data-bottom', '30')
    element.setAttribute('data-left', '40')
    document.body.appendChild(element)

    autoInitializeFromDataAttributes(initFn)
    document.dispatchEvent(new Event('DOMContentLoaded'))

    const config = (initFn as MockedFunction<(config: WidgetConfig) => WidgetInstance>).mock
      .calls[0][0]
    expect(config.top).toBe(10)
    expect(config.right).toBe(20)
    expect(config.bottom).toBe(30)
    expect(config.left).toBe(40)
  })

  it('handles hasConsent attribute', () => {
    const initFn = vi.fn((_config: WidgetConfig) => ({
      open: vi.fn(),
      close: vi.fn(),
      toggle: vi.fn(),
      sendMessage: vi.fn(),
      hide: vi.fn(),
      show: vi.fn(),
      openChatDirectly: vi.fn(),
      setDarkMode: vi.fn(),
      setConsentRequired: vi.fn(),
      setConsentGranted: vi.fn(),
      setPosition: vi.fn(),
      setWidth: vi.fn(),
      setHeight: vi.fn(),
      setTop: vi.fn(),
      setRight: vi.fn(),
      setBottom: vi.fn(),
      setLeft: vi.fn(),
      setFabSize: vi.fn(),
      setActions: vi.fn(),
      setUserName: vi.fn(),
      setUserEmail: vi.fn(),
      setUserId: vi.fn(),
      setLocale: vi.fn(),
      setMessages: vi.fn(),
      stopReply: vi.fn(),
      destroy: vi.fn(),
    })) as (config: WidgetConfig) => WidgetInstance

    const element = document.createElement('div')
    element.setAttribute('data-clearideas-widget', '')
    element.setAttribute('data-access-key', 'test-key')
    element.setAttribute('data-has-consent', 'true')
    document.body.appendChild(element)

    autoInitializeFromDataAttributes(initFn)
    document.dispatchEvent(new Event('DOMContentLoaded'))

    expect(initFn).toHaveBeenCalled()
    const config = (initFn as MockedFunction<(config: WidgetConfig) => WidgetInstance>).mock
      .calls[0][0]
    expect(config.hasConsent).toBe(true)
  })

  it('delays initialization when hasConsent is false', () => {
    vi.useFakeTimers()
    const initFn = vi.fn((_config: WidgetConfig) => ({
      open: vi.fn(),
      close: vi.fn(),
      toggle: vi.fn(),
      sendMessage: vi.fn(),
      hide: vi.fn(),
      show: vi.fn(),
      openChatDirectly: vi.fn(),
      setDarkMode: vi.fn(),
      setConsentRequired: vi.fn(),
      setConsentGranted: vi.fn(),
      setPosition: vi.fn(),
      setWidth: vi.fn(),
      setHeight: vi.fn(),
      setTop: vi.fn(),
      setRight: vi.fn(),
      setBottom: vi.fn(),
      setLeft: vi.fn(),
      setFabSize: vi.fn(),
      setActions: vi.fn(),
      setUserName: vi.fn(),
      setUserEmail: vi.fn(),
      setUserId: vi.fn(),
      setLocale: vi.fn(),
      setMessages: vi.fn(),
      stopReply: vi.fn(),
      destroy: vi.fn(),
    })) as (config: WidgetConfig) => WidgetInstance

    const element = document.createElement('div')
    element.setAttribute('data-clearideas-widget', '')
    element.setAttribute('data-access-key', 'test-key')
    element.setAttribute('data-has-consent', 'false')
    document.body.appendChild(element)

    autoInitializeFromDataAttributes(initFn)
    document.dispatchEvent(new Event('DOMContentLoaded'))

    expect(initFn).not.toHaveBeenCalled()

    // Simulate consent being granted via global variable
    ;(window as any).hasConsent = true
    element.setAttribute('data-has-consent', 'hasConsent')
    autoInitializeFromDataAttributes(initFn)
    document.dispatchEvent(new Event('DOMContentLoaded'))

    vi.advanceTimersByTime(200)
    expect(initFn).toHaveBeenCalled()

    vi.useRealTimers()
  })

  it('handles darkMode attribute', () => {
    const initFn = vi.fn((_config: WidgetConfig) => ({
      open: vi.fn(),
      close: vi.fn(),
      toggle: vi.fn(),
      sendMessage: vi.fn(),
      hide: vi.fn(),
      show: vi.fn(),
      openChatDirectly: vi.fn(),
      setDarkMode: vi.fn(),
      setConsentRequired: vi.fn(),
      setConsentGranted: vi.fn(),
      setPosition: vi.fn(),
      setWidth: vi.fn(),
      setHeight: vi.fn(),
      setTop: vi.fn(),
      setRight: vi.fn(),
      setBottom: vi.fn(),
      setLeft: vi.fn(),
      setFabSize: vi.fn(),
      setActions: vi.fn(),
      setUserName: vi.fn(),
      setUserEmail: vi.fn(),
      setUserId: vi.fn(),
      setLocale: vi.fn(),
      setMessages: vi.fn(),
      stopReply: vi.fn(),
      destroy: vi.fn(),
    })) as (config: WidgetConfig) => WidgetInstance

    const element = document.createElement('div')
    element.setAttribute('data-clearideas-widget', '')
    element.setAttribute('data-access-key', 'test-key')
    element.setAttribute('data-dark-mode', 'true')
    document.body.appendChild(element)

    autoInitializeFromDataAttributes(initFn)
    document.dispatchEvent(new Event('DOMContentLoaded'))

    const config = (initFn as MockedFunction<(config: WidgetConfig) => WidgetInstance>).mock
      .calls[0][0]
    expect(config.darkMode).toBe(true)
  })

  it('passes the signed-in user from data attributes', () => {
    const initFn = vi.fn((_config: WidgetConfig) => ({
      open: vi.fn(),
      close: vi.fn(),
      toggle: vi.fn(),
      sendMessage: vi.fn(),
      hide: vi.fn(),
      show: vi.fn(),
      openChatDirectly: vi.fn(),
      setDarkMode: vi.fn(),
      setConsentRequired: vi.fn(),
      setConsentGranted: vi.fn(),
      setPosition: vi.fn(),
      setWidth: vi.fn(),
      setHeight: vi.fn(),
      setTop: vi.fn(),
      setRight: vi.fn(),
      setBottom: vi.fn(),
      setLeft: vi.fn(),
      setFabSize: vi.fn(),
      setActions: vi.fn(),
      setUserName: vi.fn(),
      setUserEmail: vi.fn(),
      setUserId: vi.fn(),
      setLocale: vi.fn(),
      setMessages: vi.fn(),
      stopReply: vi.fn(),
      destroy: vi.fn(),
    })) as (config: WidgetConfig) => WidgetInstance

    const element = document.createElement('div')
    element.setAttribute('data-clearideas-widget', '')
    element.setAttribute('data-access-key', 'test-key')
    element.setAttribute('data-user-id', 'user-42')
    element.setAttribute('data-user-name', 'Ada')
    document.body.appendChild(element)

    autoInitializeFromDataAttributes(initFn)
    document.dispatchEvent(new Event('DOMContentLoaded'))

    const config = (initFn as MockedFunction<(config: WidgetConfig) => WidgetInstance>).mock
      .calls[0][0]
    expect(config.userId).toBe('user-42')
    expect(config.userName).toBe('Ada')
    expect(config.userEmail).toBeUndefined()
  })

  it('handles fabSize and fabHide attributes', () => {
    const initFn = vi.fn((_config: WidgetConfig) => ({
      open: vi.fn(),
      close: vi.fn(),
      toggle: vi.fn(),
      sendMessage: vi.fn(),
      hide: vi.fn(),
      show: vi.fn(),
      openChatDirectly: vi.fn(),
      setDarkMode: vi.fn(),
      setConsentRequired: vi.fn(),
      setConsentGranted: vi.fn(),
      setPosition: vi.fn(),
      setWidth: vi.fn(),
      setHeight: vi.fn(),
      setTop: vi.fn(),
      setRight: vi.fn(),
      setBottom: vi.fn(),
      setLeft: vi.fn(),
      setFabSize: vi.fn(),
      setActions: vi.fn(),
      setUserName: vi.fn(),
      setUserEmail: vi.fn(),
      setUserId: vi.fn(),
      setLocale: vi.fn(),
      setMessages: vi.fn(),
      stopReply: vi.fn(),
      destroy: vi.fn(),
    })) as (config: WidgetConfig) => WidgetInstance

    const element = document.createElement('div')
    element.setAttribute('data-clearideas-widget', '')
    element.setAttribute('data-access-key', 'test-key')
    element.setAttribute('data-fab-size', '64')
    element.setAttribute('data-fab-hide', 'true')
    document.body.appendChild(element)

    autoInitializeFromDataAttributes(initFn)
    document.dispatchEvent(new Event('DOMContentLoaded'))

    const config = (initFn as MockedFunction<(config: WidgetConfig) => WidgetInstance>).mock
      .calls[0][0]
    expect(config.fabSize).toBe(64)
    expect(config.fabHide).toBe(true)
  })

  it('does not initialize if access key is missing', () => {
    const initFn = vi.fn()

    const element = document.createElement('div')
    element.setAttribute('data-clearideas-widget', '')
    // No data-access-key attribute
    document.body.appendChild(element)

    autoInitializeFromDataAttributes(initFn)
    document.dispatchEvent(new Event('DOMContentLoaded'))

    expect(initFn).not.toHaveBeenCalled()
  })

  it('initializes multiple widgets', () => {
    const initFn = vi.fn((_config: WidgetConfig) => ({
      open: vi.fn(),
      close: vi.fn(),
      toggle: vi.fn(),
      sendMessage: vi.fn(),
      hide: vi.fn(),
      show: vi.fn(),
      openChatDirectly: vi.fn(),
      setDarkMode: vi.fn(),
      setConsentRequired: vi.fn(),
      setConsentGranted: vi.fn(),
      setPosition: vi.fn(),
      setWidth: vi.fn(),
      setHeight: vi.fn(),
      setTop: vi.fn(),
      setRight: vi.fn(),
      setBottom: vi.fn(),
      setLeft: vi.fn(),
      setFabSize: vi.fn(),
      setActions: vi.fn(),
      setUserName: vi.fn(),
      setUserEmail: vi.fn(),
      setUserId: vi.fn(),
      setLocale: vi.fn(),
      setMessages: vi.fn(),
      stopReply: vi.fn(),
      destroy: vi.fn(),
    })) as (config: WidgetConfig) => WidgetInstance

    const element1 = document.createElement('div')
    element1.setAttribute('data-clearideas-widget', '')
    element1.setAttribute('data-access-key', 'key-1')
    document.body.appendChild(element1)

    const element2 = document.createElement('div')
    element2.setAttribute('data-clearideas-widget', '')
    element2.setAttribute('data-access-key', 'key-2')
    document.body.appendChild(element2)

    autoInitializeFromDataAttributes(initFn)
    document.dispatchEvent(new Event('DOMContentLoaded'))

    expect(initFn).toHaveBeenCalledTimes(2)
  })
  describe('elements added or removed after the page loaded', () => {
    const flush = () => new Promise(resolve => setTimeout(resolve, 0)) // mutation observers
    const widgetElement = (key: string) => {
      const element = document.createElement('div')
      element.setAttribute('data-clearideas-widget', '')
      element.setAttribute('data-access-key', key)
      return element
    }
    const mockInit = () =>
      vi.fn((_config: WidgetConfig) => ({ destroy: vi.fn() }) as unknown as WidgetInstance)

    it('initializes elements added later, directly or inside an added subtree', async () => {
      const initFn = mockInit()
      const stop = autoInitializeFromDataAttributes(initFn)
      await flush()
      expect(initFn).not.toHaveBeenCalled()

      document.body.appendChild(widgetElement('direct'))
      const wrapper = document.createElement('section')
      wrapper.appendChild(widgetElement('nested'))
      document.body.appendChild(wrapper)
      await flush()

      expect(initFn.mock.calls.map(call => call[0].accessKey)).toEqual(['direct', 'nested'])
      stop()
    })

    it('destroys the widget when its element is removed', async () => {
      const initFn = mockInit()
      const element = widgetElement('key')
      const wrapper = document.createElement('main')
      wrapper.appendChild(element)
      document.body.appendChild(wrapper)
      const stop = autoInitializeFromDataAttributes(initFn)
      await flush()
      const instance = initFn.mock.results[0].value as WidgetInstance

      wrapper.remove() // for example a single-page-app route change
      await flush()
      expect(instance.destroy).toHaveBeenCalledTimes(1)
      stop()
    })

    it('stops waiting for consent when the element is removed', async () => {
      vi.useFakeTimers()
      const initFn = mockInit()
      ;(window as any).laterConsent = false
      const element = widgetElement('key')
      element.setAttribute('data-has-consent', 'laterConsent')
      document.body.appendChild(element)
      const stop = autoInitializeFromDataAttributes(initFn)
      await vi.advanceTimersByTimeAsync(0)

      element.remove()
      await vi.advanceTimersByTimeAsync(0)
      ;(window as any).laterConsent = true
      await vi.advanceTimersByTimeAsync(2000)
      document.dispatchEvent(new Event('clearideas-consent-granted-key'))

      expect(initFn).not.toHaveBeenCalled()
      stop()
      vi.useRealTimers()
      delete (window as any).laterConsent
    })

    it('initializes each element once, even if called again', async () => {
      document.body.appendChild(widgetElement('once'))
      const first = mockInit()
      autoInitializeFromDataAttributes(first)
      const second = mockInit()
      const stop = autoInitializeFromDataAttributes(second) // replaces the first
      await flush()
      document.body.appendChild(widgetElement('later'))
      await flush()

      expect(first).not.toHaveBeenCalled()
      expect(second.mock.calls.map(call => call[0].accessKey)).toEqual(['once', 'later'])
      stop()
    })
  })
})
